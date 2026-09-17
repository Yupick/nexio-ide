/**
 * Orchestrator that coordinates the ideas -> planning -> execution flow.
 * The user only interacts with the ideas agent; the planning agent restructures the
 * problem into phases, milestones and execution groups, and the orchestrator then
 * splits the work across the downstream agents.
 */
import { IdeasAgent } from '../agents/ideas-agent';
import { PlanningAgent } from '../agents/planning-agent';
import type { AgentContext, AgentExecutionResult, AgentTask, ProjectSnapshot, Roadmap } from '../shared/types';

interface ExecutionThread {
  id: string;
  owner: 'planning' | 'principal' | 'plugin';
  stage: 'ideas' | 'planning' | 'execution' | 'validation';
  status: 'queued' | 'running' | 'waiting' | 'done';
  dependencies: string[];
  taskId: string;
  createdAt: string;
}

export class AgentOrchestrator {
  private readonly ideasAgent = new IdeasAgent();
  private readonly planningAgent = new PlanningAgent();

  private buildExecutionThreads(task: AgentTask, roadmap: Roadmap): ExecutionThread[] {
    const tasks = roadmap.tasks && roadmap.tasks.length > 0 ? roadmap.tasks : [{
      id: `${task.id}-root`,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dependencies: task.dependencies ?? []
    }];

    return tasks.map((entry, index) => ({
      id: `thread-${entry.id ?? `${task.id}-${index}`}`,
      owner: index % 2 === 0 ? 'planning' : 'principal',
      stage: entry.priority === 'high' ? 'execution' : 'validation',
      status: index === 0 ? 'running' : 'queued',
      dependencies: entry.dependencies ?? [],
      taskId: task.id,
      createdAt: new Date().toISOString()
    }));
  }

  private buildMessageBus(task: AgentTask, roadmap: Roadmap): Array<Record<string, unknown>> {
    const entries = [
      {
        id: `msg-${task.id}-planning`,
        type: 'task',
        from: 'planning-agent',
        to: 'principal-agent',
        correlationId: task.id,
        payload: { taskId: task.id, summary: roadmap.summary ?? 'Roadmap created and staged for execution.' },
        createdAt: new Date().toISOString()
      },
      {
        id: `msg-${task.id}-principal`,
        type: 'ack',
        from: 'principal-agent',
        to: 'planning-agent',
        correlationId: task.id,
        payload: { taskId: task.id, status: 'queued', accepted: true },
        createdAt: new Date().toISOString()
      }
    ];

    return entries;
  }

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

    const threads = this.buildExecutionThreads(task, roadmap);
    const messageBus = this.buildMessageBus(task, roadmap);

    return {
      ok: ideaResult.ok && planResult.ok,
      message: 'Ideas flow completed, planning output was normalized, and the orchestrator staged execution by phase.',
      data: {
        taskId: task.id,
        ideaResult,
        planResult,
        roadmap,
        orchestratedTasks,
        threads,
        messageBus,
        contextRoot: snapshot.rootPath,
        stage: 'orchestrated'
      }
    };
  }
}
