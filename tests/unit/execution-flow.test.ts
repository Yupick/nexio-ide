import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DiffEngine } from '../../src/backend/diff-engine';
import { ExecutionManager } from '../../src/backend/execution-manager';

describe('execution flow', () => {
  test('generates an approval-ready diff from a file change', () => {
    const diff = DiffEngine.createPatch(
      'const foo = 1;\n',
      'const foo = 2;\n',
      'example.ts'
    );

    expect(diff).toContain('--- example.ts');
    expect(diff).toContain('+++ example.ts');
    expect(diff).toContain('-const foo = 1;');
    expect(diff).toContain('+const foo = 2;');
  });

  test('approves execution when diff is accepted', async () => {
    const manager = new ExecutionManager();
    const result = await manager.executeApprovedTask({
      id: 'task-exec-1',
      title: 'Apply patch',
      description: 'Apply a safe patch to a file.',
      priority: 'high',
      dependencies: []
    }, {
      approved: true,
      patch: '--- file.txt\n+++ file.txt\n@@\n-old\n+new\n'
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('approved', true);
    expect(result.data).toHaveProperty('status', 'approved');
  });

  test('records rejected diff decisions and keeps a workflow history', async () => {
    const manager = new ExecutionManager();
    const result = await manager.executeApprovedTask({
      id: 'task-exec-2',
      title: 'Reject unsafe patch',
      description: 'Reject a patch that goes beyond the approved root.',
      priority: 'medium',
      dependencies: []
    }, {
      approved: false,
      patch: '--- unsafe.txt\n+++ unsafe.txt\n@@\n-old\n+new\n'
    });

    expect(result.ok).toBe(false);
    expect(result.data).toHaveProperty('status', 'rejected');
    expect(manager.getHistory()).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'task-exec-2', status: 'rejected' })
    ]));
  });

  test('applies an approved patch only within the allowed workspace root', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-exec-'));
    const targetPath = path.join(tmpRoot, 'src', 'sample.ts');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'const answer = 1;\n', 'utf8');

    const manager = new ExecutionManager(path.join(tmpRoot, '.nexio', 'workflow-history.json'));
    const result = await manager.applyApprovedPatch(
      {
        id: 'task-exec-3',
        title: 'Apply safe patch',
        description: 'Apply an approved patch within the project sandbox.',
        priority: 'high',
        dependencies: []
      },
      {
        approved: true,
        patch: '--- src/sample.ts\n+++ src/sample.ts\n@@\n-const answer = 1;\n+const answer = 42;\n',
        targetPath: 'src/sample.ts'
      },
      tmpRoot
    );

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(targetPath, 'utf8')).toContain('const answer = 42;');
    expect(manager.getHistory()).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'task-exec-3', status: 'approved' })
    ]));
  });

  test('persists execution metadata alongside approval decisions', async () => {
    const manager = new ExecutionManager();
    const result = await manager.executeApprovedTask({
      id: 'task-exec-4',
      title: 'Persist execution metadata',
      description: 'Ensure the execution history includes provider and snapshot correlation metadata.',
      priority: 'high',
      dependencies: []
    }, {
      approved: true,
      patch: '--- file.txt\n+++ file.txt\n@@\n-old\n+new\n',
      targetPath: 'file.txt',
      metadata: {
        agent: 'principal',
        provider: 'ollama',
        model: 'llama3.1',
        snapshotHash: 'abc123',
        taskId: 'task-exec-4'
      }
    });

    expect(result.ok).toBe(true);
    expect(manager.getHistory()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: 'task-exec-4',
        agent: 'principal',
        provider: 'ollama',
        model: 'llama3.1',
        snapshotHash: 'abc123'
      })
    ]));
  });
});
