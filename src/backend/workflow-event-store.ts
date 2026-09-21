import fs from 'node:fs';
import path from 'node:path';

import type { WorkflowEvent, WorkflowEventRecord } from '../shared/types';

const SENSITIVE_KEYS = new Set(['apiKey', 'apikey', 'authorization', 'token', 'secret', 'password', 'prompt']);

function sanitizeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      continue;
    }
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean' || entry === null) {
      sanitized[key] = entry;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export class WorkflowEventStore {
  private readonly filePath: string;
  private readonly maxEntries: number;

  constructor(workspaceRoot: string, maxEntries = 2000) {
    this.filePath = path.join(path.resolve(workspaceRoot), '.nexio', 'workflow-events.jsonl');
    this.maxEntries = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : 2000;
  }

  public append(event: WorkflowEvent, context: Pick<WorkflowEventRecord, 'planId' | 'planRevision' | 'runId' | 'pluginId' | 'status'> = {}): WorkflowEventRecord {
    const record: WorkflowEventRecord = {
      eventId: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: event.type,
      timestamp: event.timestamp,
      taskId: event.taskId,
      message: event.message,
      ...context,
      metadata: sanitizeMetadata(event.metadata)
    };

    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    this.rotate();
    return record;
  }

  public list(filter: { runId?: string; planId?: string; taskId?: string } = {}): WorkflowEventRecord[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    return fs.readFileSync(this.filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const record = JSON.parse(line) as WorkflowEventRecord;
          if (filter.runId && record.runId !== filter.runId) return [];
          if (filter.planId && record.planId !== filter.planId) return [];
          if (filter.taskId && record.taskId !== filter.taskId) return [];
          return [record];
        } catch {
          return [];
        }
      });
  }

  private rotate(): void {
    const lines = fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    if (lines.length <= this.maxEntries) {
      return;
    }
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${lines.slice(-this.maxEntries).join('\n')}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}