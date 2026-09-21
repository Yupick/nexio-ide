import type { AgentExecutionResult, AgentTask, PluginContext, PluginInstance } from '../../shared/types';

export default function createPlugin(context: PluginContext): PluginInstance {
  return {
    id: 'testing-plugin',
    name: 'Testing Plugin',
    type: 'agent',
    version: '0.1.0',
    capabilities: ['testing', 'qa', 'validation', 'verify'],
    async init() {
      context.logger('Testing plugin initialized.');
    },
    async execute(task: AgentTask, context?: { snapshot?: { rootPath?: string } }): Promise<AgentExecutionResult> {
      return {
        ok: true,
        message: `Testing plugin validated ${task.title}.`,
        data: {
          taskId: task.id,
          plugin: 'testing-plugin',
          contextRoot: context?.snapshot?.rootPath ?? 'unknown'
        }
      };
    }
  };
}
