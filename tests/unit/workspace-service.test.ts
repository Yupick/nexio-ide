import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { listWorkspace, readWorkspaceFile, writeWorkspaceFile } from '../../src/backend/workspace-service';

describe('workspace service', () => {
  it('lists files within the allowed workspace and ignores git/vendor folders', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-workspace-'));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'main.ts'), 'console.log("hi");');
    fs.writeFileSync(path.join(tempDir, '.git', 'config'), 'ignored');
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'dep.js'), 'ignored');

    const items = listWorkspace(tempDir);
    const flattened = items.flatMap((node) => [node, ...(node.children ?? [])]).map((node) => node.path);

    expect(flattened).toContain('src');
    expect(flattened).toContain('src/main.ts');
    expect(flattened).not.toContain('.git');
    expect(flattened).not.toContain('node_modules');
  });

  it('reads and writes content inside the workspace root', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-write-'));
    const targetFile = 'src/editor.ts';

    writeWorkspaceFile(tempDir, targetFile, 'const mode = "desktop";');
    const content = readWorkspaceFile(tempDir, targetFile);

    expect(content).toBe('const mode = "desktop";');
  });
});
