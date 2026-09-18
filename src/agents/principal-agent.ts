/**
 * Principal orchestrator agent.
 * It coordinates tasks and delegates execution to available plugins.
 */
import { DiffEngine } from '../backend/diff-engine';
import { createContentHash } from '../backend/content-hash';
import type { AgentContext, AgentExecutionResult, AgentMessage, AgentTask, PluginInstance, StructuredChange } from '../shared/types';

export class PrincipalAgent {
  private readonly plugins: PluginInstance[];

  constructor(plugins: PluginInstance[] = []) {
    this.plugins = plugins;
  }

  public async sendMessage(to: string, from: string, type: AgentMessage['type'], payload: Record<string, unknown>, correlationId?: string): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: `message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      from,
      to,
      correlationId,
      payload,
      createdAt: new Date().toISOString()
    };

    const plugin = this.plugins.find((entry) => entry.id === to);
    if (!plugin || typeof plugin.handleMessage !== 'function') {
      return message;
    }

    const response = await plugin.handleMessage(message);
    return response ?? message;
  }

  public registerPlugin(plugin: PluginInstance): void {
    this.plugins.push(plugin);
  }

  public getPluginCapabilities(): Record<string, string[]> {
    return Object.fromEntries(this.plugins.map((plugin) => [plugin.id, plugin.capabilities ?? []]));
  }

  public resolveRelevantPlugins(task: AgentTask): PluginInstance[] {
    const text = `${task.title} ${task.description}`.toLowerCase();

    if (!this.plugins.length) {
      return [];
    }

    return this.plugins.filter((plugin) => {
      const capabilities = plugin.capabilities ?? [];
      return capabilities.some((capability) => text.includes(capability.toLowerCase()));
    }).length > 0
      ? this.plugins.filter((plugin) => {
          const capabilities = plugin.capabilities ?? [];
          return capabilities.some((capability) => text.includes(capability.toLowerCase()));
        })
      : this.plugins;
  }

  public async execute(context: AgentContext, task: AgentTask): Promise<AgentExecutionResult> {
    const relevantPlugins = this.resolveRelevantPlugins(task);
    const selectedPlugins = relevantPlugins.length ? relevantPlugins : this.plugins;

    const messageLog: AgentMessage[] = [];
    const pluginResults = selectedPlugins.length
      ? await Promise.all(selectedPlugins.map(async (plugin) => {
          try {
            const dispatchMessage: AgentMessage = {
              id: `message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              type: 'task',
              from: 'principal-agent',
              to: plugin.id,
              correlationId: task.id,
              payload: { task, context },
              createdAt: new Date().toISOString()
            };
            messageLog.push(dispatchMessage);

            const messageReply = await this.sendMessage(plugin.id, 'principal-agent', 'task', { task, context }, task.id);
            if (messageReply && messageReply.id) {
              messageLog.push(messageReply);
            }

            const executionResult = await plugin.execute(task, context);
            messageLog.push({
              id: `message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              type: 'result',
              from: plugin.id,
              to: 'principal-agent',
              correlationId: task.id,
              payload: { result: executionResult },
              createdAt: new Date().toISOString()
            });

            return executionResult;
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
      .map((result, index) => {
        const pluginName = String((result.data as Record<string, unknown>).plugin ?? selectedPlugins[index]?.id ?? 'unknown');
        const summaryMessage = `${pluginName} processed ${task.title}. Details: ${result.message}`;
        const diff = DiffEngine.createApprovalSummary(
          task.title,
          pluginName,
          result.message,
          `${task.id}-${pluginName}.patch`
        );

        return {
          plugin: pluginName,
          message: summaryMessage,
          diff,
          status: 'awaiting_review'
        };
      });

    const changes: StructuredChange[] = pluginResults.flatMap((result) => {
      const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : null;
      const targetPath = typeof data?.targetPath === 'string' ? data.targetPath.trim() : '';
      const patch = typeof data?.patch === 'string' ? data.patch.trim() : '';
      const before = typeof data?.before === 'string' ? data.before : null;
      return targetPath && patch
        ? [{
            targetPath,
            patch,
        pluginId: typeof data?.plugin === 'string' ? data.plugin : undefined,
        ...(before !== null ? { baseContentHash: createContentHash(before) } : {})
          }]
        : [];
    });

    return {
      ok: successful.length > 0 || pluginResults.length === 1 && pluginResults[0].ok,
      message: `Principal agent processed ${task.title} with ${selectedPlugins.length} plugin(s) and staged the reviewable execution result.`,
      data: {
        taskId: task.id,
        executedPlugins: selectedPlugins.length,
        taskDispatch: selectedPlugins.map((plugin) => plugin.id),
        availableCapabilities: [...new Set(this.plugins.flatMap((plugin) => plugin.capabilities ?? []))],
        messages: messageLog,
        results: pluginResults,
        patchSummary,
        changes,
        contextRoot: context.snapshot.rootPath,
        reviewRequired: true
      }
    };
  }
}
