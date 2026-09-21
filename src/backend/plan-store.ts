import fs from 'node:fs';
import path from 'node:path';

import type { PlanRun } from '../shared/types';

export class PlanStore {
  private readonly filePath: string;

  constructor(workspaceRoot: string) {
    this.filePath = path.join(path.resolve(workspaceRoot), '.nexio', 'plan-runs.json');
  }

  public list(): PlanRun[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
      return Array.isArray(parsed) ? parsed as PlanRun[] : [];
    } catch {
      return [];
    }
  }

  public get(planId: string): PlanRun | undefined {
    return this.list().find((plan) => plan.planId === planId);
  }

  public getLatestForSession(sessionId: string): PlanRun | undefined {
    return this.list()
      .filter((plan) => plan.sessionId === sessionId)
      .sort((left, right) => right.revision - left.revision)[0];
  }

  public save(plan: PlanRun): PlanRun {
    const plans = this.list().filter((entry) => entry.planId !== plan.planId);
    plans.unshift(plan);

    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(plans.slice(0, 50), null, 2), 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
    return plan;
  }
}