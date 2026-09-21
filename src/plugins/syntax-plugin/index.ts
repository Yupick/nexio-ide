import type { AgentExecutionResult, AgentTask, PluginContext, PluginInstance } from '../../shared/types';

export default function createPlugin(context: PluginContext): PluginInstance {
  return {
    id: 'syntax-plugin',
    name: 'Syntax Plugin',
    type: 'syntax',
    version: '0.1.0',
    capabilities: ['syntax', 'parse', 'lint', 'compile'],
    async init() {
      context.logger('Syntax plugin initialized.');
    },
    async execute(task: AgentTask, context?: { snapshot?: { rootPath?: string } }): Promise<AgentExecutionResult> {
      return {
        ok: true,
        message: `Syntax plugin parsed ${task.title}.`,
        data: {
          taskId: task.id,
          plugin: 'syntax-plugin',
          contextRoot: context?.snapshot?.rootPath ?? 'unknown'
        }
      };
    }
  };
}
