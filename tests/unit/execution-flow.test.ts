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
  });
});
