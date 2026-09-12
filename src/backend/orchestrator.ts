/**
 * Orchestrator that coordinates the ideas -> planning -> execution flow.
 * The user only interacts with the ideas agent; the planning agent restructures the
 * problem into phases, milestones and execution groups, and the orchestrator then
 * splits the work across the downstream agents.
 */
import { IdeasAgent } from '../agents/ideas-agent';
import { PlanningAgent } from '../agents/planning-agent';
import type { AgentContext, AgentExecutionResult, AgentTask, ProjectSnapshot, Roadmap } from '../shared/types';

export class AgentOrchestrator {
  private readonly ideasAgent = new IdeasAgent();
  private readonly planningAgent = new PlanningAgent();

  public async runIdeaWorkflow(snapshot: ProjectSnapshot, task: AgentTask): Promise<AgentExecutionResult> {
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

    const roadmap: Roadmap = (planResult.data?.roadmap ?? {
      version: '1.0.0',
      summary: 'No roadmap generated yet.',
      tasks: []
    }) as Roadmap;

    const orchestratedTasks = (roadmap.tasks ?? []).map((entry, index) => ({
      ...entry,
      order: index + 1,
      stage: entry.priority === 'high' ? 'execution' : 'validation'
    }));

    return {
      ok: ideaResult.ok && planResult.ok,
      message: 'Ideas flow completed, planning output was normalized, and the orchestrator staged execution by phase.',
      data: {
        taskId: task.id,
        ideaResult,
        planResult,
        roadmap,
        orchestratedTasks,
        contextRoot: snapshot.rootPath,
        stage: 'orchestrated'
      }
    };
  }
}
