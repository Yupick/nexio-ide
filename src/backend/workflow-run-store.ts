import fs from 'node:fs';
import path from 'node:path';

import type { WorkflowRun } from '../shared/types';

export class WorkflowRunStore {
  private readonly filePath: string;

  constructor(workspaceRoot: string) {
    this.filePath = path.join(path.resolve(workspaceRoot), '.nexio', 'workflow-runs.json');
  }

  public list(): WorkflowRun[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
      return Array.isArray(parsed) ? parsed as WorkflowRun[] : [];
    } catch {
      return [];
    }
  }

  public get(runId: string): WorkflowRun | undefined {
    return this.list().find((run) => run.runId === runId);
  }

  public updateStatus(runId: string, status: WorkflowRun['status']): WorkflowRun | undefined {
    const run = this.get(runId);
    if (!run) {
      return undefined;
    }
    return this.save({ ...run, status, updatedAt: new Date().toISOString() });
  }

  public save(run: WorkflowRun): WorkflowRun {
    const runs = this.list().filter((entry) => entry.runId !== run.runId);
    runs.unshift(run);
    this.write(runs.slice(0, 50));
    return run;
  }

  public recoverExpiredLeases(now = new Date()): WorkflowRun[] {
    const runs = this.list();
    const recovered = runs.map((run) => {
      let changed = false;
      const tasks = run.tasks.map((task) => {
        if (task.status !== 'running' || !task.leaseExpiresAt || new Date(task.leaseExpiresAt) > now) {
          return task;
        }

        changed = true;
        return {
          ...task,
          status: 'retryable' as const,
          leaseId: undefined,
          leaseExpiresAt: undefined,
          heartbeatAt: undefined,
          result: { ...(task.result ?? {}), recovery: 'lease-expired' },
          updatedAt: now.toISOString()
        };
      });

      return changed
        ? { ...run, status: 'running' as const, tasks, updatedAt: now.toISOString() }
        : run;
    });

    if (recovered.some((run, index) => run !== runs[index])) {
      this.write(recovered);
    }
    return recovered;
  }

  private write(runs: WorkflowRun[]): void {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(runs, null, 2), 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}