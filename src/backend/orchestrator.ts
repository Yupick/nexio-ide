/**
 * Orchestrator that coordinates the read-only ideas flow and planning output.
 */
import { IdeasAgent } from '../agents/ideas-agent';
import { PlanningAgent } from '../agents/planning-agent';
import type { AgentContext, AgentTask, ProjectSnapshot, Roadmap } from '../shared/types';

export class AgentOrchestrator {
  private readonly ideasAgent = new IdeasAgent();
  private readonly planningAgent = new PlanningAgent();

  public async runIdeaWorkflow(snapshot: ProjectSnapshot, task: AgentTask) {
    const context: AgentContext = {
      snapshot,
      roadmap: {
        version: '1.0.0',
        summary: 'Workflow initialized from project snapshot.',
        tasks: []
      } as Roadmap,
      sandbox: {
        allowedRoots: [snapshot.rootPath],
        readOnly: true
      }
    };

    const ideaResult = await this.ideasAgent.think(context, task);
    const planResult = await this.planningAgent.plan(context, task);

    return {
      ok: ideaResult.ok && planResult.ok,
      message: 'Ideas flow completed and planning output produced.',
      data: {
        taskId: task.id,
        ideaResult,
        roadmap: planResult.data?.roadmap,
        contextRoot: snapshot.rootPath
      }
    };
  }
}
