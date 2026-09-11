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
      ? await Promise.all(this.plugins.map(async (plugin) => plugin.execute(task)))
      : [{ ok: true, message: `No plugins registered for ${task.title}.` }];

    const successful = pluginResults.filter((result) => result.ok);

    return {
      ok: successful.length > 0,
      message: `Principal agent processed ${task.title} with ${this.plugins.length} plugin(s).`,
      data: {
        taskId: task.id,
        executedPlugins: this.plugins.length,
        results: pluginResults,
        contextRoot: context.snapshot.rootPath
      }
    };
  }
}
