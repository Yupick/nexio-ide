/**
 * Principal orchestrator agent.
 * It coordinates tasks and delegates execution to available plugins.
 */
import type { AgentContext, AgentExecutionResult, AgentTask, PluginInstance } from '../shared/types';

export class PrincipalAgent {
  private readonly plugins: PluginInstance[];

  constructor(plugins: PluginInstance[] = []) {
    this.plugins = plugins;
  }

  public registerPlugin(plugin: PluginInstance): void {
    this.plugins.push(plugin);
  }

  public async execute(context: AgentContext, task: AgentTask): Promise<AgentExecutionResult> {
    const pluginResults = this.plugins.length
      ? await Promise.all(this.plugins.map(async (plugin) => {
          try {
            return await plugin.execute(task);
          } catch (error) {
            return {
              ok: false,
              message: `Plugin ${plugin.name} failed for ${task.title}: ${error instanceof Error ? error.message : 'unknown error'}`,
              data: { taskId: task.id, plugin: plugin.name }
            };
          }
        }))
      : [{
          ok: true,
          message: `No plugins registered for ${task.title}; execution is staged for review and approval.`,
          data: { taskId: task.id, plugin: 'none', staged: true }
        }];

    const successful = pluginResults.filter((result) => result.ok);
    const patchSummary = pluginResults
      .filter((result) => result.data && typeof result.data === 'object')
      .map((result) => ({
        plugin: (result.data as Record<string, unknown>).plugin ?? 'unknown',
        message: result.message
      }));

    return {
      ok: successful.length > 0 || pluginResults.length === 1 && pluginResults[0].ok,
      message: `Principal agent processed ${task.title} with ${this.plugins.length} plugin(s) and staged the reviewable execution result.`,
      data: {
        taskId: task.id,
        executedPlugins: this.plugins.length,
        results: pluginResults,
        patchSummary,
        contextRoot: context.snapshot.rootPath,
        reviewRequired: true
      }
    };
  }
}
