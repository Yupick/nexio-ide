import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createContentHash } from '../../src/backend/content-hash';
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

  test('rotates workflow history to keep only the latest approved decisions', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-history-'));
    const historyPath = path.join(tmpRoot, '.nexio', 'workflow-history.json');
    const manager = new ExecutionManager(historyPath, 2);

    for (let i = 0; i < 5; i += 1) {
      await manager.executeApprovedTask({
        id: `task-history-${i}`,
        title: `History item ${i}`,
        description: `Persist execution history item ${i}`,
        priority: 'medium',
        dependencies: []
      }, {
        approved: true,
        patch: `--- file-${i}.txt\n+++ file-${i}.txt\n@@\n-old\n+new\n`,
        targetPath: `file-${i}.txt`
      });
    }

    expect(manager.getHistory()).toHaveLength(2);
    expect(manager.getHistory()[0]).toEqual(expect.objectContaining({ taskId: 'task-history-4' }));
    expect(manager.getHistory()[1]).toEqual(expect.objectContaining({ taskId: 'task-history-3' }));
  });

  test('rejects a patch when the resolved target is outside the workspace root', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-root-'));
    const manager = new ExecutionManager(path.join(tmpRoot, '.nexio', 'workflow-history.json'));

    await expect(manager.applyApprovedPatch(
      {
        id: 'task-outside-root',
        title: 'Attempt escape',
        description: 'Try to apply an approved patch outside the sandbox root.',
        priority: 'high',
        dependencies: []
      },
      {
        approved: true,
        patch: '--- /etc/passwd\n+++ /etc/passwd\n@@\n-root\n+safe\n',
        targetPath: '../etc/passwd'
      },
      tmpRoot
    )).rejects.toThrow(/outside the sandbox root/);
  });

  test('rejects approval when the change is not a structured workspace diff', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-invalid-'));
    const manager = new ExecutionManager(path.join(tmpRoot, '.nexio', 'workflow-history.json'));
    const task = {
      id: 'task-invalid-change',
      title: 'Ignore roadmap text',
      description: 'Do not apply arbitrary model output.',
      priority: 'high' as const,
      dependencies: []
    };

    await expect(manager.decideApproval(task, {
      approved: true,
      patch: '- roadmap item\n+ completed item',
      targetPath: 'src/sample.ts'
    }, tmpRoot)).rejects.toThrow(/structured unified diff/);
    expect(manager.getHistory()).toEqual([]);
    expect(fs.existsSync(path.join(tmpRoot, 'src', 'sample.ts'))).toBe(false);
  });

  test('routes a valid rejection through the execution manager without writing the file', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-reject-'));
    const manager = new ExecutionManager(path.join(tmpRoot, '.nexio', 'workflow-history.json'));
    const result = await manager.decideApproval({
      id: 'task-reject-change',
      title: 'Reject safe diff',
      description: 'Keep the workspace unchanged.',
      priority: 'medium',
      dependencies: []
    }, {
      approved: false,
      change: {
        targetPath: 'src/sample.ts',
        patch: '--- src/sample.ts\n+++ src/sample.ts\n@@\n-old\n+new\n'
      },
      patch: '--- src/sample.ts\n+++ src/sample.ts\n@@\n-old\n+new\n',
      targetPath: 'src/sample.ts'
    }, tmpRoot);

    expect(result.ok).toBe(false);
    expect(result.data).toMatchObject({ status: 'rejected', targetPath: 'src/sample.ts' });
    expect(manager.getHistory()[0]).toEqual(expect.objectContaining({ taskId: 'task-reject-change', status: 'rejected' }));
    expect(fs.existsSync(path.join(tmpRoot, 'src', 'sample.ts'))).toBe(false);
  });

  test('applies a structured diff at its hunk location and preserves surrounding content', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-context-'));
    const targetPath = path.join(tmpRoot, 'src', 'sample.ts');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'before\nreplace\nafter\n', 'utf8');
    const manager = new ExecutionManager(path.join(tmpRoot, '.nexio', 'workflow-history.json'));

    await expect(manager.decideApproval({
      id: 'task-context-change',
      title: 'Apply contextual diff',
      description: 'Apply a change without moving it to the end of the file.',
      priority: 'medium',
      dependencies: []
    }, {
      approved: true,
      change: {
        targetPath: 'src/sample.ts',
        patch: '--- src/sample.ts\n+++ src/sample.ts\n@@ -2,1 +2,1 @@\n-before\n+after\n'
      },
      patch: '--- src/sample.ts\n+++ src/sample.ts\n@@ -2,1 +2,1 @@\n-before\n+after\n',
      targetPath: 'src/sample.ts'
    }, tmpRoot)).rejects.toThrow(/Patch removal does not match/);

    await manager.decideApproval({
      id: 'task-context-change',
      title: 'Apply contextual diff',
      description: 'Apply a change without moving it to the end of the file.',
      priority: 'medium',
      dependencies: []
    }, {
      approved: true,
      change: {
        targetPath: 'src/sample.ts',
        patch: '--- src/sample.ts\n+++ src/sample.ts\n@@ -2,1 +2,1 @@\n-replace\n+updated\n'
      },
      patch: '--- src/sample.ts\n+++ src/sample.ts\n@@ -2,1 +2,1 @@\n-replace\n+updated\n',
      targetPath: 'src/sample.ts'
    }, tmpRoot);

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('before\nupdated\nafter\n');
  });

  test('applies multiple structured changes atomically', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-multi-'));
    const firstPath = path.join(tmpRoot, 'src', 'first.ts');
    const secondPath = path.join(tmpRoot, 'src', 'second.ts');
    fs.mkdirSync(path.dirname(firstPath), { recursive: true });
    fs.writeFileSync(firstPath, 'const first = 1;\n', 'utf8');
    fs.writeFileSync(secondPath, 'const second = 1;\n', 'utf8');

    const manager = new ExecutionManager(path.join(tmpRoot, '.nexio', 'workflow-history.json'));
    const result = await manager.decideApproval({
      id: 'task-multi-1',
      title: 'Apply multiple files',
      description: 'Apply a coordinated change.',
      priority: 'high',
      dependencies: []
    }, {
      approved: true,
      patch: '',
      changes: [
        {
          targetPath: 'src/first.ts',
          patch: '--- src/first.ts\n+++ src/first.ts\n@@\n-const first = 1;\n+const first = 2;\n',
          baseContentHash: createContentHash('const first = 1;\n')
        },
        {
          targetPath: 'src/second.ts',
          patch: '--- src/second.ts\n+++ src/second.ts\n@@\n-const second = 1;\n+const second = 2;\n',
          baseContentHash: createContentHash('const second = 1;\n')
        }
      ]
    }, tmpRoot);

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(firstPath, 'utf8')).toBe('const first = 2;\n');
    expect(fs.readFileSync(secondPath, 'utf8')).toBe('const second = 2;\n');
  });

  test('rejects a conflicting multi-file change without mutating any file', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-conflict-'));
    const firstPath = path.join(tmpRoot, 'first.ts');
    const secondPath = path.join(tmpRoot, 'second.ts');
    fs.writeFileSync(firstPath, 'const first = 1;\n', 'utf8');
    fs.writeFileSync(secondPath, 'const second = changed;\n', 'utf8');

    const manager = new ExecutionManager(path.join(tmpRoot, '.nexio', 'workflow-history.json'));
    await expect(manager.decideApproval({
      id: 'task-multi-conflict',
      title: 'Reject conflicting files',
      description: 'Do not partially apply a stale change.',
      priority: 'high',
      dependencies: []
    }, {
      approved: true,
      patch: '',
      changes: [
        {
          targetPath: 'first.ts',
          patch: '--- first.ts\n+++ first.ts\n@@\n-const first = 1;\n+const first = 2;\n',
          baseContentHash: createContentHash('const first = 1;\n')
        },
        {
          targetPath: 'second.ts',
          patch: '--- second.ts\n+++ second.ts\n@@\n-const second = 1;\n+const second = 2;\n',
          baseContentHash: createContentHash('const second = 1;\n')
        }
      ]
    }, tmpRoot)).rejects.toThrow(/changed since the patch was generated/);

    expect(fs.readFileSync(firstPath, 'utf8')).toBe('const first = 1;\n');
    expect(fs.readFileSync(secondPath, 'utf8')).toBe('const second = changed;\n');
  });
});
