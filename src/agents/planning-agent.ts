/**
 * Planning agent produces a structured roadmap JSON payload.
 */
import type { AgentContext, AgentExecutionResult, AgentTask, Roadmap } from '../shared/types';

export class PlanningAgent {
  public async plan(context: AgentContext, task: AgentTask): Promise<AgentExecutionResult> {
    const roadmap: Roadmap = {
      version: '1.0.0',
      summary: `Plan generated from task: ${task.title}`,
      tasks: [
        {
          id: `${task.id}-setup`,
          title: 'Project setup',
          description: 'Initialize configuration and tooling.',
          priority: 'high',
          dependencies: []
        },
        {
          id: `${task.id}-execution`,
          title: task.title,
          description: task.description,
          priority: task.priority,
          dependencies: task.dependencies.length > 0 ? task.dependencies : [`${task.id}-setup`]
        }
      ]
    };

    return {
      ok: true,
      message: 'Planning agent created a roadmap payload.',
      data: {
        taskId: task.id,
        roadmap,
        contextRoot: context.snapshot.rootPath
      }
    };
  }
}
