import { ResourceLockManager, ResourceLockTimeoutError, resourcesConflict } from '../../src/backend/resource-lock-manager';

describe('ResourceLockManager', () => {
  test('allows concurrent reads but conflicts writes with reads and writes', () => {
    expect(resourcesConflict({ readPaths: ['src/app.ts'] }, { readPaths: ['src/app.ts'] })).toBe(false);
    expect(resourcesConflict({ writePaths: ['src/app.ts'] }, { readPaths: ['src/app.ts'] })).toBe(true);
    expect(resourcesConflict({ writePaths: ['src'] }, { writePaths: ['src/app.ts'] })).toBe(true);
    expect(resourcesConflict({ resourceKeys: ['workspace-index'] }, { resourceKeys: ['workspace-index'] })).toBe(true);
  });

  test('waits for release and keeps independent resources available', async () => {
    const manager = new ResourceLockManager();
    const first = await manager.acquire('first', { writePaths: ['src/app.ts'] });
    const waiting = manager.acquire('second', { writePaths: ['src/app.ts'] }, 100);
    const independent = await manager.acquire('independent', { writePaths: ['README.md'] });

    independent.release();
    first.release();
    const second = await waiting;
    second.release();
  });

  test('times out blocked acquisition and releases after errors through finally', async () => {
    const manager = new ResourceLockManager();
    const first = await manager.acquire('first', { resourceKeys: ['index'] });

    await expect(manager.acquire('blocked', { resourceKeys: ['index'] }, 5)).rejects.toBeInstanceOf(ResourceLockTimeoutError);
    await expect(manager.withResources('failing', { writePaths: ['other.ts'] }, async () => {
      throw new Error('task failed');
    })).rejects.toThrow('task failed');

    first.release();
    const recovered = await manager.acquire('recovered', { writePaths: ['other.ts'] }, 20);
    recovered.release();
  });
});