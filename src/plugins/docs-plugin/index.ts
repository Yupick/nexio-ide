import type { AgentExecutionResult, AgentTask, PluginContext, PluginInstance } from '../../shared/types';

export default function createPlugin(context: PluginContext): PluginInstance {
  return {
    id: 'docs-plugin',
    name: 'Docs Plugin',
    type: 'agent',
    version: '0.1.0',
    capabilities: ['docs', 'documentation', 'readme', 'guide'],
    async init() {
      context.logger('Docs plugin initialized.');
    },
    async execute(task: AgentTask, context?: { snapshot?: { rootPath?: string } }): Promise<AgentExecutionResult> {
      return {
        ok: true,
        message: `Docs plugin updated documentation for ${task.title}.`,
        data: {
          taskId: task.id,
          plugin: 'docs',
          contextRoot: context?.snapshot?.rootPath ?? 'unknown'
        }
      };
    }
  };
}
