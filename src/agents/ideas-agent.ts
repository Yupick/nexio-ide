/**
 * Read-only ideas agent.
 * It can inspect the project snapshot and roadmap, but never writes to disk.
 */
import type { AgentContext, AgentExecutionResult, AgentTask, Roadmap } from '../shared/types';

export class IdeasAgent {
  public async think(context: AgentContext, task: AgentTask): Promise<AgentExecutionResult> {
    const snapshot = context.snapshot;
    const roadmap = context.roadmap ?? ({ version: '0.1.0', summary: 'No roadmap yet.', tasks: [] } as Roadmap);

    const suggestions = [
      `Project ${snapshot.name} currently exposes ${snapshot.files.length} tracked files.`,
      `Current roadmap has ${roadmap.tasks.length} task entries.`,
      `Suggested task: ${task.title}`
    ];

    return {
      ok: true,
      message: 'Ideas agent generated a read-only proposal.',
      data: {
        taskId: task.id,
        suggestions,
        readOnly: true,
        snapshotName: snapshot.name
      }
    };
  }
}
