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
    const suggestedAgent = typeof task.metadata?.suggestedAgent === 'string'
      ? task.metadata.suggestedAgent.trim()
      : '';
    const requiredCapabilities = Array.isArray(task.metadata?.requiredCapabilities)
      ? task.metadata.requiredCapabilities.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.toLowerCase())
      : [];

    if (!this.plugins.length) {
      return [];
    }

    if (suggestedAgent && suggestedAgent !== 'principal-agent') {
      const selectedPlugin = this.plugins.find((plugin) => plugin.id === suggestedAgent);
      return selectedPlugin ? [selectedPlugin] : [];
    }

    if (requiredCapabilities.length > 0) {
      return this.plugins.filter((plugin) => requiredCapabilities.every((required) => (
        (plugin.capabilities ?? []).some((capability) => capability.toLowerCase() === required)
      )));
    }

    const capabilityMatches = this.plugins.filter((plugin) => {
      const capabilities = plugin.capabilities ?? [];
      return capabilities.some((capability) => text.includes(capability.toLowerCase()));
    });

    if (capabilityMatches.length > 0) {
      return capabilityMatches;
    }

    return suggestedAgent === 'principal-agent' || !suggestedAgent ? this.plugins : [];
  }

  public async execute(context: AgentContext, task: AgentTask): Promise<AgentExecutionResult> {
    const relevantPlugins = this.resolveRelevantPlugins(task);
    const selectedPlugins = relevantPlugins;
    const suggestedAgent = typeof task.metadata?.suggestedAgent === 'string'
      ? task.metadata.suggestedAgent.trim()
      : '';
    const hasExplicitPluginRequirement = Boolean(suggestedAgent && suggestedAgent !== 'principal-agent');

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

            const executionResult = await this.executePlugin(plugin, task, context);
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
          ok: !hasExplicitPluginRequirement,
          message: hasExplicitPluginRequirement
            ? `No hay un plugin compatible autorizado para ${task.title}; la tarea queda pendiente de decisión del orquestador.`
            : `No hay plugins registrados para ${task.title}; la ejecución queda preparada para revisión.`,
          data: { taskId: task.id, plugin: 'none', staged: true, ...(hasExplicitPluginRequirement ? { blocked: true } : {}) }
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
      ok: successful.length > 0 || (!hasExplicitPluginRequirement && selectedPlugins.length === 0),
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

  private async executePlugin(plugin: PluginInstance, task: AgentTask, context: AgentContext): Promise<AgentExecutionResult> {
    if (plugin.healthCheck) {
      const health = await plugin.healthCheck();
      if (!health.ok) {
        return {
          ok: false,
          message: health.message || `Plugin ${plugin.name} no está saludable.`,
          data: { taskId: task.id, plugin: plugin.id, blocked: true, healthCheck: true, retryable: true }
        };
      }
    }
    const timeoutMs = Number.isFinite(plugin.timeoutMs) && (plugin.timeoutMs ?? 0) > 0 ? plugin.timeoutMs as number : 0;
    if (!timeoutMs) {
      return this.enforcePluginPermissions(plugin, task, await plugin.execute(task, context));
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        plugin.execute(task, context),
        new Promise<AgentExecutionResult>((resolve) => {
          timeoutHandle = setTimeout(() => resolve({
            ok: false,
            message: `Plugin ${plugin.name} excedió el timeout de ${timeoutMs} ms.`,
            data: { taskId: task.id, plugin: plugin.id, timeout: true, retryable: true }
          }), timeoutMs);
        })
      ]);
      return this.enforcePluginPermissions(plugin, task, result);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private enforcePluginPermissions(plugin: PluginInstance, task: AgentTask, result: AgentExecutionResult): AgentExecutionResult {
    const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {};
    const hasChanges = typeof data.patch === 'string' || typeof data.targetPath === 'string' || Array.isArray(data.changes);
    if (plugin.permissions?.readOnly === true && hasChanges) {
      return {
        ok: false,
        message: `Plugin ${plugin.name} es de solo lectura y no puede producir cambios aplicables.`,
        data: { taskId: task.id, plugin: plugin.id, blocked: true, permissionDenied: true }
      };
    }
    const targetPaths = [
      ...(typeof data.targetPath === 'string' ? [data.targetPath] : []),
      ...(Array.isArray(data.changes) ? data.changes.flatMap((change) => change && typeof change === 'object' && typeof (change as Record<string, unknown>).targetPath === 'string' ? [(change as Record<string, unknown>).targetPath as string] : []) : [])
    ].map((targetPath) => targetPath.replaceAll('\\', '/'));
    const allowedRoots = plugin.permissions?.allowedRoots ?? [];
    if (allowedRoots.length > 0 && !allowedRoots.includes('workspace')) {
      const outsideAllowedRoot = targetPaths.some((targetPath) => !allowedRoots.some((allowedRoot) => targetPath === allowedRoot || targetPath.startsWith(`${allowedRoot}/`)));
      if (outsideAllowedRoot) {
        return {
          ok: false,
          message: `Plugin ${plugin.name} produjo un cambio fuera de sus rutas permitidas.`,
          data: { taskId: task.id, plugin: plugin.id, blocked: true, permissionDenied: true }
        };
      }
    }
    return result;
  }
}
