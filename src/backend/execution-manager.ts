/**
 * Execution manager for a signed-off diff workflow.
 * Keeps the decision record and enforces the idea that only an approved diff becomes
 * an actual workspace mutation.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { AgentTask } from '../shared/types';

export interface ApprovedExecution {
  approved: boolean;
  patch: string;
  targetPath?: string;
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
}

export class ExecutionManager {
  private readonly history: WorkflowHistoryEntry[] = [];
  private readonly historyPath: string;

  constructor(historyPath = path.join(process.cwd(), '.nexio', 'workflow-history.json')) {
    this.historyPath = historyPath;
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

  private persistHistory(): void {
    fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2), 'utf8');
  }

  public getHistory(): WorkflowHistoryEntry[] {
    const persisted = this.loadPersistedHistory();
    if (persisted.length && this.history.length === 0) {
      this.history.push(...persisted);
    }
    return [...this.history];
  }

  private resolveTargetPath(targetPath: string | undefined, workspaceRoot: string): string {
    const root = path.resolve(workspaceRoot);
    const candidate = targetPath ? path.resolve(root, targetPath) : root;
    const relative = path.relative(root, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Patch target ${targetPath ?? 'workspace root'} is outside the sandbox root ${root}.`);
    }
    return candidate;
  }

  public async applyApprovedPatch(task: AgentTask, approval: ApprovedExecution, workspaceRoot = process.cwd()): Promise<ExecutionResult> {
    if (!approval.approved) {
      return this.executeApprovedTask(task, approval);
    }

    const targetPath = this.resolveTargetPath(approval.targetPath, workspaceRoot);
    const fileContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
    const patchText = approval.patch.trim();
    const nextContent = patchText.startsWith('---') && patchText.includes('+++')
      ? (() => {
          const lines = patchText.split('\n');
          const next: string[] = [];
          let inHunk = false;
          let sourceLines = fileContent.split('\n');

          for (const line of lines) {
            if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@')) {
              if (line.startsWith('@@')) {
                inHunk = true;
              }
              continue;
            }

            if (!inHunk) {
              continue;
            }

            if (line.startsWith('+')) {
              next.push(line.slice(1));
              continue;
            }

            if (line.startsWith('-')) {
              if (sourceLines.length > 0) {
                sourceLines.shift();
              }
              continue;
            }

            if (line.length === 0 && sourceLines.length > 0) {
              next.push('');
            }
          }

          const merged = [...sourceLines];
          return [...merged, ...next].join('\n');
        })()
      : patchText;

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, nextContent, 'utf8');

    return this.executeApprovedTask(task, approval);
  }

  public async executeApprovedTask(task: AgentTask, approval: ApprovedExecution): Promise<ExecutionResult> {
    const approvedAt = new Date().toISOString();
    const entry: WorkflowHistoryEntry = {
      taskId: task.id,
      status: approval.approved ? 'approved' : 'rejected',
      patch: approval.patch,
      approvedAt,
      message: approval.approved
        ? `Task ${task.id} executed and approved.`
        : `Task ${task.id} was rejected by the user.`,
      targetPath: approval.targetPath
    };

    this.history.push(entry);
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
