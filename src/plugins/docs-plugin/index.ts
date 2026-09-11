import type { AgentExecutionResult, AgentTask, PluginContext, PluginInstance } from '../../shared/types';

export default function createPlugin(context: PluginContext): PluginInstance {
  return {
    id: 'docs-plugin',
    name: 'Docs Plugin',
    type: 'agent',
    version: '0.1.0',
    async init() {
      context.logger('Docs plugin initialized.');
    },
    async execute(task: AgentTask): Promise<AgentExecutionResult> {
      return {
        ok: true,
        message: `Docs plugin updated documentation for ${task.title}.`,
        data: {
          taskId: task.id,
          plugin: 'docs'
        }
      };
    }
  };
}
