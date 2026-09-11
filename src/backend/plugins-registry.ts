/**
 * Central registry for plugin definitions used by the principal agent.
 */
import type { PluginDefinition } from '../shared/types';

export class PluginRegistry {
  private readonly plugins: Map<string, PluginDefinition> = new Map();

  public register(plugin: PluginDefinition): void {
    this.plugins.set(plugin.id, plugin);
  }

  public list(): PluginDefinition[] {
    return [...this.plugins.values()];
  }

  public get(id: string): PluginDefinition | undefined {
    return this.plugins.get(id);
  }
}
