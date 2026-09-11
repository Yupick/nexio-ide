/**
 * Plugin manager that discovers and loads plugin modules from the project plugins dir.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { PluginContext, PluginDefinition, PluginInstance } from '../shared/types';

export class PluginManager {
  private readonly pluginsDir: string;

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
  }

  public async loadAll(context: PluginContext): Promise<PluginInstance[]> {
    if (!fs.existsSync(this.pluginsDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    const pluginDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    const loaded: PluginInstance[] = [];

    for (const pluginDir of pluginDirs) {
      const pluginEntry = path.join(this.pluginsDir, pluginDir, 'index.ts');
      if (!fs.existsSync(pluginEntry)) {
        continue;
      }

      const importedModule = await import(pluginEntry);
      const factory = importedModule.default ?? importedModule.plugin ?? importedModule.createPlugin;

      if (typeof factory !== 'function') {
        continue;
      }

      const instance = factory(context);
      if (instance && typeof instance.execute === 'function') {
        await instance.init(context);
        loaded.push(instance);
      }
    }

    return loaded;
  }

  public getDefinitions(): PluginDefinition[] {
    if (!fs.existsSync(this.pluginsDir)) {
      return [];
    }

    return fs.readdirSync(this.pluginsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        id: entry.name,
        name: entry.name,
        version: '0.1.0',
        type: 'agent',
        description: `${entry.name} plugin`,
        entry: path.join(this.pluginsDir, entry.name)
      }));
  }
}
