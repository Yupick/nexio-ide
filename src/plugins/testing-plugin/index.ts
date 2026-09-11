import type { AgentExecutionResult, AgentTask, PluginContext, PluginInstance } from '../../shared/types';

export default function createPlugin(context: PluginContext): PluginInstance {
  return {
    id: 'testing-plugin',
    name: 'Testing Plugin',
    type: 'agent',
    version: '0.1.0',
    async init() {
      context.logger('Testing plugin initialized.');
    },
    async execute(task: AgentTask): Promise<AgentExecutionResult> {
      return {
        ok: true,
        message: `Testing plugin validated ${task.title}.`,
        data: {
          taskId: task.id,
          plugin: 'testing'
        }
      };
    }
  };
}
