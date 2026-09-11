/**
 * Loader for plugin definitions and runtime instances.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PluginContext, PluginDefinition, PluginInstance } from '../shared/types';

export class PluginLoader {
  private readonly pluginsDir: string;

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
  }

  public listPluginDefinitions(): PluginDefinition[] {
    if (!fs.existsSync(this.pluginsDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        id: entry.name,
        name: entry.name,
        version: '0.1.0',
        type: 'tool',
        description: `${entry.name} plugin`,
        entry: path.join(this.pluginsDir, entry.name)
      }));
  }

  public async loadPlugin(definition: PluginDefinition, context: PluginContext): Promise<PluginInstance> {
    const pluginModulePath = path.join(definition.entry, 'index.ts');

    if (!fs.existsSync(pluginModulePath)) {
      throw new Error(`No implementation found for plugin ${definition.id} at ${pluginModulePath}.`);
    }

    const importedModule = await import(pluginModulePath);
    const pluginFactory = importedModule.default ?? importedModule.plugin ?? importedModule.createPlugin;

    if (typeof pluginFactory !== 'function') {
      throw new Error(`Plugin ${definition.id} does not export a valid factory.`);
    }

    const instance = pluginFactory(context);

    if (!instance || typeof instance.init !== 'function' || typeof instance.execute !== 'function') {
      throw new Error(`Plugin ${definition.id} is missing required init/execute methods.`);
    }

    await instance.init(context);

    return instance;
  }
}
