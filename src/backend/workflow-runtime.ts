/**
 * Runtime state for the complete IDE workflow.
 * Provides a durable operational representation of the ideas -> plan -> execute -> approval flow.
 */
import { IdeasAgent } from '../agents/ideas-agent';
import { PlanningAgent } from '../agents/planning-agent';
import { PrincipalAgent } from '../agents/principal-agent';
import type { AgentContext, AgentExecutionResult, AgentTask, ProjectSnapshot, Roadmap } from '../shared/types';

export type ApprovalStatus = 'awaiting_review' | 'approved' | 'rejected';

export interface WorkflowState {
  id: string;
  title: string;
  approvalStatus: ApprovalStatus;
  createdAt: string;
}

export class WorkflowRuntime {
  private readonly ideasAgent = new IdeasAgent();
  private readonly planningAgent = new PlanningAgent();
  private readonly principalAgent = new PrincipalAgent();

  public createState(id: string, title: string): WorkflowState {
    return {
      id,
      title,
      approvalStatus: 'awaiting_review',
      createdAt: new Date().toISOString()
    };
  }

  public setApprovalState(state: WorkflowState, approvalStatus: ApprovalStatus): void {
    state.approvalStatus = approvalStatus;
  }

  public async runWorkflow(snapshot: ProjectSnapshot, task: AgentTask): Promise<AgentExecutionResult> {
    const context: AgentContext = {
      snapshot,
      roadmap: {
        version: '1.0.0',
        summary: 'Operational QA workflow initialized.',
        tasks: []
      } as Roadmap,
      sandbox: {
        allowedRoots: [snapshot.rootPath],
        readOnly: true
      }
    };

    const ideaResult = await this.ideasAgent.think(context, task);
    const planResult = await this.planningAgent.plan(context, task);
    const principalResult = await this.principalAgent.execute(context, task);

    return {
      ok: ideaResult.ok && planResult.ok && principalResult.ok,
      message: 'End-to-end workflow reached the approval gate.',
      data: {
        taskId: task.id,
        ideaResult,
        planResult,
        principalResult,
        approvalStatus: 'awaiting_review'
      }
    };
  }
}
