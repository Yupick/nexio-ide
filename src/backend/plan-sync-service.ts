import type { AgentRuntimeSettings } from './config';
import { PlanService } from './plan-service';
import type { PlanGenerationRequest, PlanGenerationResult } from '../shared/types';

export interface PlanSyncScheduler {
  schedule(request: PlanGenerationRequest, onResult: (result: PlanGenerationResult) => void): void;
  schedulePromise(request: PlanGenerationRequest, runner: (request: PlanGenerationRequest) => Promise<PlanGenerationResult>): Promise<PlanGenerationResult>;
  cancel(sessionId: string): void;
  cancelAll(): void;
}

export class DebouncedPlanSyncService implements PlanSyncScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingResolvers = new Map<string, (result: PlanGenerationResult) => void>();

  public constructor(
    private readonly delayMs = 600,
    private readonly planService?: PlanService,
    private readonly workspaceRoot?: string,
    private readonly runtimeSettings?: AgentRuntimeSettings
  ) {}

  public schedule(request: PlanGenerationRequest, onResult: (result: PlanGenerationResult) => void): void {
    this.cancel(request.sessionId);
    const timer = setTimeout(() => {
      this.timers.delete(request.sessionId);
      if (!this.planService || !this.workspaceRoot || !this.runtimeSettings) {
        onResult({ ok: false, message: 'Plan sync requires a PlanService handler.' });
        return;
      }
      void this.planService.generatePlan(request, this.workspaceRoot, this.runtimeSettings).then(onResult);
    }, this.delayMs);
    this.timers.set(request.sessionId, timer);
  }

  public schedulePromise(
    request: PlanGenerationRequest,
    runner: (request: PlanGenerationRequest) => Promise<PlanGenerationResult>
  ): Promise<PlanGenerationResult> {
    return new Promise((resolve) => {
      this.cancel(request.sessionId);
      this.pendingResolvers.set(request.sessionId, resolve);
      const timer = setTimeout(() => {
        this.timers.delete(request.sessionId);
        this.pendingResolvers.delete(request.sessionId);
        void runner(request).then(resolve).catch((error: unknown) => resolve({
          ok: false,
          message: error instanceof Error ? error.message : 'Plan sync failed.'
        }));
      }, this.delayMs);
      this.timers.set(request.sessionId, timer);
    });
  }

  public cancel(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
    const resolve = this.pendingResolvers.get(sessionId);
    if (resolve) {
      this.pendingResolvers.delete(sessionId);
      resolve({ ok: false, message: 'La sincronización del plan fue reemplazada por una revisión más reciente.' });
    }
  }

  public cancelAll(): void {
    for (const sessionId of this.timers.keys()) {
      this.cancel(sessionId);
    }
  }
}