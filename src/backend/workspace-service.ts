/**
 * Workspace helpers for the desktop editor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Sandbox } from './sandbox';

export interface WorkspaceNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: WorkspaceNode[];
}

function shouldSkipDir(name: string): boolean {
  return ['.git', 'node_modules', 'dist', '.next', 'coverage'].includes(name);
}

export function listWorkspace(rootPath: string): WorkspaceNode[] {
  const resolvedRoot = path.resolve(rootPath);

  const walk = (currentDir: string): WorkspaceNode[] => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .filter((entry) => !shouldSkipDir(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    return entries.map((entry) => {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(resolvedRoot, fullPath);

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: relativePath,
          type: 'directory',
          children: walk(fullPath)
        };
      }

      return {
        name: entry.name,
        path: relativePath,
        type: 'file'
      };
    });
  };

  return walk(resolvedRoot);
}

export function readWorkspaceFile(rootPath: string, relativePath: string): string {
  const sandbox = new Sandbox({ allowedRoots: [rootPath] });
  return sandbox.readText(path.join(rootPath, relativePath));
}

export function writeWorkspaceFile(rootPath: string, relativePath: string, content: string): void {
  const sandbox = new Sandbox({ allowedRoots: [rootPath] });
  sandbox.writeText(path.join(rootPath, relativePath), content);
}
