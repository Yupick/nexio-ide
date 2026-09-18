/**
 * Execution manager for a signed-off diff workflow.
 * Keeps the decision record and enforces the idea that only an approved diff becomes
 * an actual workspace mutation.
 */
import fs from 'node:fs';
import path from 'node:path';

import { createContentHash } from './content-hash';
import type { AgentTask, StructuredChange } from '../shared/types';

export interface ApprovedExecution {
  approved: boolean;
  patch: string;
  targetPath?: string;
  change?: StructuredChange;
  changes?: StructuredChange[];
  metadata?: Record<string, unknown>;
}

export interface ExecutionResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface WorkflowHistoryEntry {
  taskId: string;
  status: 'approved' | 'rejected';
  patch: string;
  approvedAt: string;
  message: string;
  targetPath?: string;
  targetPaths?: string[];
  agent?: string;
  provider?: string;
  model?: string;
  snapshotHash?: string;
  baseUrl?: string;
  startedAt?: string;
  metadata?: Record<string, unknown>;
}

export class ExecutionManager {
  private readonly history: WorkflowHistoryEntry[] = [];
  private readonly historyPath: string;
  private readonly maxHistoryEntries: number;

  constructor(historyPath = path.join(process.cwd(), '.nexio', 'workflow-history.json'), maxHistoryEntries = 50) {
    this.historyPath = historyPath;
    this.maxHistoryEntries = Number.isFinite(maxHistoryEntries) && maxHistoryEntries > 0 ? maxHistoryEntries : 50;
    this.ensureHistoryStorage();
  }

  private ensureHistoryStorage(): void {
    const dir = path.dirname(this.historyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.historyPath)) {
      fs.writeFileSync(this.historyPath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  private loadPersistedHistory(): WorkflowHistoryEntry[] {
    try {
      const raw = fs.readFileSync(this.historyPath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as WorkflowHistoryEntry[] : [];
    } catch {
      return [];
    }
  }

  private trimHistory(): void {
    if (this.history.length <= this.maxHistoryEntries) {
      return;
    }

    this.history.splice(this.maxHistoryEntries);
  }

  private persistHistory(): void {
    this.trimHistory();
    fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2), 'utf8');
  }

  public getHistory(): WorkflowHistoryEntry[] {
    const persisted = this.loadPersistedHistory();
    if (persisted.length && this.history.length === 0) {
      this.history.push(...persisted.reverse());
      this.trimHistory();
    }
    return [...this.history];
  }

  private resolveTargetPath(targetPath: string | undefined, workspaceRoot: string): string {
    const root = path.resolve(workspaceRoot);
    const candidate = targetPath ? path.resolve(root, targetPath) : root;
    const relative = path.relative(root, candidate);
    if (!targetPath || relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Patch target ${targetPath ?? 'workspace root'} is outside the sandbox root ${root}.`);
    }
    return candidate;
  }

  private resolveStructuredChange(change: StructuredChange, workspaceRoot: string): StructuredChange {
    const targetPath = String(change.targetPath ?? '').trim();
    const patch = String(change.patch ?? '').trim();
    const resolvedTargetPath = this.resolveTargetPath(targetPath, workspaceRoot);
    if (fs.existsSync(resolvedTargetPath) && !fs.statSync(resolvedTargetPath).isFile()) {
      throw new Error(`Patch target ${targetPath} is not a workspace file.`);
    }

    if (!patch || !/^--- ([^\r\n]+)\r?\n\+\+\+ ([^\r\n]+)\r?\n/m.test(patch) || !/^@@[^\r\n]*(?:\r?\n|$)/m.test(patch)) {
      throw new Error('Approval requires a structured unified diff with a target file and hunk.');
    }

    const headers = patch.match(/^--- ([^\r\n]+)\r?\n\+\+\+ ([^\r\n]+)/m);
    if (!headers || headers[1].trim() !== targetPath || headers[2].trim() !== targetPath) {
      throw new Error('Approval target does not match the structured diff headers.');
    }

    if (!/^(?:\+(?!\+\+\+)|-(?!---))[^\r\n]*$/m.test(patch)) {
      throw new Error('Approval requires at least one changed line in the structured diff.');
    }

    return {
      ...change,
      targetPath,
      patch,
      ...(change.baseContentHash ? { baseContentHash: change.baseContentHash.trim() } : {})
    };
  }

  private resolveStructuredChanges(approval: ApprovedExecution, workspaceRoot: string): StructuredChange[] {
    const changes = approval.changes?.length
      ? approval.changes
      : [approval.change ?? { targetPath: approval.targetPath ?? '', patch: approval.patch }];

    if (!changes.length) {
      throw new Error('Approval requires at least one structured change.');
    }

    return changes.map((change) => this.resolveStructuredChange(change, workspaceRoot));
  }

  public async applyApprovedPatch(task: AgentTask, approval: ApprovedExecution, workspaceRoot = process.cwd()): Promise<ExecutionResult> {
    if (!approval.approved) {
      return this.executeApprovedTask(task, approval);
    }

    const changes = this.resolveStructuredChanges(approval, workspaceRoot);
    const nextFiles = changes.map((change) => {
      const targetPath = this.resolveTargetPath(change.targetPath, workspaceRoot);
      const fileContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
      if (change.baseContentHash && createContentHash(fileContent) !== change.baseContentHash) {
        throw new Error(`Workspace file ${change.targetPath} changed since the patch was generated.`);
      }

      const patchText = change.patch;
      const nextContent = patchText.startsWith('---') && patchText.includes('+++')
        ? (() => {
          const lines = patchText.split(/\r?\n/);
          const sourceLines = fileContent.split('\n');
          const output: string[] = [];
          let sourceIndex = 0;
          let hunkStarted = false;

          for (const line of lines) {
            if (line.startsWith('--- ') || line.startsWith('+++ ')) {
              continue;
            }

            if (line.startsWith('@@')) {
              const range = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
              if (range) {
                const hunkStart = Number(range[1]) - 1;
                if (hunkStart < sourceIndex || hunkStart > sourceLines.length) {
                  throw new Error(`Patch hunk starts outside the workspace file ${change.targetPath}.`);
                }
                output.push(...sourceLines.slice(sourceIndex, hunkStart));
                sourceIndex = hunkStart;
              }
              hunkStarted = true;
              continue;
            }

            if (!hunkStarted || line.startsWith('\\')) {
              continue;
            }

            const marker = line[0];
            const content = line.slice(1);
            if (marker === ' ') {
              if (sourceLines[sourceIndex] !== content) {
                throw new Error(`Patch context does not match ${change.targetPath}.`);
              }
              output.push(content);
              sourceIndex += 1;
            } else if (marker === '-') {
              if (sourceLines[sourceIndex] !== content) {
                throw new Error(`Patch removal does not match ${change.targetPath}.`);
              }
              sourceIndex += 1;
            } else if (marker === '+') {
              output.push(content);
            } else {
              throw new Error(`Patch contains an invalid unified diff line for ${change.targetPath}.`);
            }
          }

          output.push(...sourceLines.slice(sourceIndex));
            return output.join('\n');
          })()
        : patchText;

      return { change, targetPath, nextContent };
    });

    nextFiles.forEach(({ targetPath, nextContent }) => {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, nextContent, 'utf8');
    });

    return this.executeApprovedTask(task, {
      ...approval,
      change: changes[0],
      changes,
      patch: changes.map((change) => change.patch).join('\n\n'),
      targetPath: changes[0].targetPath
    });
  }

  public async decideApproval(task: AgentTask, approval: ApprovedExecution, workspaceRoot = process.cwd()): Promise<ExecutionResult> {
    const changes = this.resolveStructuredChanges(approval, workspaceRoot);
    const normalizedApproval: ApprovedExecution = {
      ...approval,
      patch: changes.map((change) => change.patch).join('\n\n'),
      targetPath: changes[0].targetPath,
      change: changes[0],
      changes
    };

    return normalizedApproval.approved
      ? this.applyApprovedPatch(task, normalizedApproval, workspaceRoot)
      : this.executeApprovedTask(task, normalizedApproval);
  }

  public async executeApprovedTask(task: AgentTask, approval: ApprovedExecution): Promise<ExecutionResult> {
    const approvedAt = new Date().toISOString();
    const metadata = approval.metadata && typeof approval.metadata === 'object' ? approval.metadata as Record<string, unknown> : {};
    const entry: WorkflowHistoryEntry = {
      taskId: task.id,
      status: approval.approved ? 'approved' : 'rejected',
      patch: approval.patch,
      approvedAt,
      message: approval.approved
        ? `Task ${task.id} executed and approved.`
        : `Task ${task.id} was rejected by the user.`,
      targetPath: approval.targetPath,
      ...(approval.changes?.length ? { targetPaths: approval.changes.map((change) => change.targetPath) } : {}),
      ...(typeof metadata.agent === 'string' ? { agent: metadata.agent } : {}),
      ...(typeof metadata.provider === 'string' ? { provider: metadata.provider } : {}),
      ...(typeof metadata.model === 'string' ? { model: metadata.model } : {}),
      ...(typeof metadata.snapshotHash === 'string' ? { snapshotHash: metadata.snapshotHash } : {}),
      ...(typeof metadata.baseUrl === 'string' ? { baseUrl: metadata.baseUrl } : {}),
      ...(typeof metadata.startedAt === 'string' ? { startedAt: metadata.startedAt } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {})
    };

    this.history.unshift(entry);
    this.trimHistory();
    this.persistHistory();

    if (!approval.approved) {
      return {
        ok: false,
        message: entry.message,
        data: {
          approved: false,
          taskId: task.id,
          status: 'rejected',
          patch: approval.patch,
          approvedAt,
          targetPath: approval.targetPath
        }
      };
    }

    return {
      ok: true,
      message: entry.message,
      data: {
        approved: true,
        taskId: task.id,
        status: 'approved',
        patch: approval.patch,
        approvedAt,
        targetPath: approval.targetPath
      }
    };
  }
}
