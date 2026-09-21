import { createHash } from 'node:crypto';

import type { ProjectSnapshot } from '../shared/types';

export function createProjectSnapshotHash(snapshot: ProjectSnapshot): string {
  return createHash('sha256')
    .update(JSON.stringify({ name: snapshot.name, rootPath: snapshot.rootPath, files: [...snapshot.files].sort() }))
    .digest('hex')
    .slice(0, 16);
}