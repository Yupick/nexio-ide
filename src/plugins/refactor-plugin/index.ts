import type { AgentExecutionResult, AgentTask, PluginContext, PluginInstance } from '../../shared/types';

export default function createPlugin(context: PluginContext): PluginInstance {
  return {
    id: 'refactor-plugin',
    name: 'Refactor Plugin',
    type: 'agent',
    version: '0.1.0',
    async init() {
      context.logger('Refactor plugin initialized.');
    },
    async execute(task: AgentTask): Promise<AgentExecutionResult> {
      return {
        ok: true,
        message: `Refactor plugin processed ${task.title}.`,
        data: {
          taskId: task.id,
          plugin: 'refactor'
        }
      };
    }
  };
}
