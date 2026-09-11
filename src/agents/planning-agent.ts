/**
 * Planning agent produces a structured roadmap JSON payload.
 */
import type { AgentContext, AgentExecutionResult, AgentTask, Roadmap } from '../shared/types';

export class PlanningAgent {
  public async plan(context: AgentContext, task: AgentTask): Promise<AgentExecutionResult> {
    const setupTaskId = `${task.id}-setup`;
    const validationTaskId = `${task.id}-validate`;

    const roadmap: Roadmap = {
      version: '1.0.0',
      summary: `Plan generated from task: ${task.title}. Targeted to the current workspace snapshot and execution boundaries.`,
      tasks: [
        {
          id: setupTaskId,
          title: 'Project context and constraints',
          description: 'Validate the sandbox root, confirm project context, and identify affected files.',
          priority: 'high',
          dependencies: []
        },
        {
          id: `${task.id}-execution`,
          title: task.title,
          description: task.description,
          priority: task.priority,
          dependencies: [setupTaskId]
        },
        {
          id: validationTaskId,
          title: 'Validation and QA gate',
          description: 'Run unit or smoke validation for the task outcome and verify lint/test safety.',
          priority: 'high',
          dependencies: [`${task.id}-execution`]
        }
      ]
    };

    return {
      ok: true,
      message: 'Planning agent created a roadmap payload grounded in the workspace and task constraints.',
      data: {
        taskId: task.id,
        roadmap,
        contextRoot: context.snapshot.rootPath,
        validationGate: validationTaskId
      }
    };
  }
}
