/**
 * Execution manager for a signed-off diff workflow.
 */
import type { AgentTask } from '../shared/types';

export interface ApprovedExecution {
  approved: boolean;
  patch: string;
}

export interface ExecutionResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export class ExecutionManager {
  public async executeApprovedTask(task: AgentTask, approval: ApprovedExecution): Promise<ExecutionResult> {
    if (!approval.approved) {
      return {
        ok: false,
        message: `Task ${task.id} was rejected by the user.`,
        data: { approved: false, taskId: task.id }
      };
    }

    return {
      ok: true,
      message: `Task ${task.id} executed and approved.`,
      data: {
        approved: true,
        taskId: task.id,
        patch: approval.patch
      }
    };
  }
}
