/**
 * Project snapshot utility for read-only agent context.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { ProjectSnapshot } from '../shared/types';

export function createProjectSnapshot(rootPath: string): ProjectSnapshot {
  const resolvedRoot = path.resolve(rootPath);
  const files: string[] = [];

  const walk = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist'].includes(entry.name)) {
          continue;
        }
        walk(fullPath);
        continue;
      }

      files.push(path.relative(resolvedRoot, fullPath));
    }
  };

  walk(resolvedRoot);

  return {
    name: 'nexio-ide',
    rootPath: resolvedRoot,
    files,
    lastUpdated: new Date().toISOString()
  };
}
