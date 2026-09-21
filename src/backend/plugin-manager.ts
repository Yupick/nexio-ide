/**
 * Plugin manager that discovers and loads plugin modules from the project plugins dir.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { PluginContext, PluginDefinition, PluginInstance, PluginRuntimeProfile } from '../shared/types';

export class PluginManager {
  private readonly pluginsDir: string;

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
  }

  private resolvePluginEntry(pluginDir: string): string {
    const sourceEntry = path.join(this.pluginsDir, pluginDir, 'index.ts');
    if (fs.existsSync(sourceEntry)) {
      return sourceEntry;
    }

    const builtEntry = path.join(this.pluginsDir, pluginDir, 'index.js');
    if (fs.existsSync(builtEntry)) {
      return builtEntry;
    }

    return sourceEntry;
  }

  private readManifest(pluginDir: string): Partial<PluginDefinition> {
    const manifestPath = path.join(this.pluginsDir, pluginDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return {};
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<PluginDefinition>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  public async loadAll(context: PluginContext, profiles: Record<string, PluginRuntimeProfile> = {}): Promise<PluginInstance[]> {
    if (!fs.existsSync(this.pluginsDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    const pluginDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    const loaded: PluginInstance[] = [];

    for (const pluginDir of pluginDirs) {
      if (profiles[pluginDir]?.enabled === false) {
        context.logger(`Plugin ${pluginDir} is disabled by runtime configuration.`);
        continue;
      }

      const pluginEntry = this.resolvePluginEntry(pluginDir);
      if (!fs.existsSync(pluginEntry)) {
        continue;
      }

      const importedModule = await import(pluginEntry);
      const factory = importedModule.default ?? importedModule.plugin ?? importedModule.createPlugin;

      if (typeof factory !== 'function') {
        continue;
      }

      const profile = profiles[pluginDir] ?? {};
      const manifest = this.readManifest(pluginDir);
      const instance = factory({ ...context, config: profile });
      if (instance && typeof instance.execute === 'function') {
        if (manifest.contractVersion && manifest.contractVersion !== '1') {
          context.logger(`Plugin ${pluginDir} uses unsupported contract ${manifest.contractVersion}.`);
          continue;
        }
        if (Array.isArray(profile.capabilities)) {
          instance.capabilities = [...profile.capabilities];
        }
        const configuredTimeout = Number.isFinite(profile.timeoutMs) ? profile.timeoutMs : undefined;
        const manifestTimeout = Number.isFinite(manifest.timeoutMs) ? manifest.timeoutMs : undefined;
        if (configuredTimeout || manifestTimeout) {
          instance.timeoutMs = Math.min(configuredTimeout ?? Number.POSITIVE_INFINITY, manifestTimeout ?? Number.POSITIVE_INFINITY);
        }
        if (manifest.permissions) {
          instance.permissions = manifest.permissions;
        }
        if (Array.isArray(manifest.readPaths)) {
          instance.readPaths = [...manifest.readPaths];
        }
        if (Array.isArray(manifest.writePaths)) {
          instance.writePaths = [...manifest.writePaths];
        }
        if (Array.isArray(manifest.resourceKeys)) {
          instance.resourceKeys = [...manifest.resourceKeys];
        }
        await instance.init({ ...context, config: profile });
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
      .map((entry) => {
        const manifest = this.readManifest(entry.name);
        return {
          id: manifest.id || entry.name,
          name: manifest.name || entry.name,
          version: manifest.version || '0.1.0',
          type: manifest.type || 'agent',
          description: manifest.description || `${entry.name} plugin`,
          entry: path.join(this.pluginsDir, entry.name),
          capabilities: manifest.capabilities || [],
          ...(manifest.taskTypes ? { taskTypes: manifest.taskTypes } : {}),
          ...(manifest.contractVersion ? { contractVersion: manifest.contractVersion } : {}),
          ...(manifest.readPaths ? { readPaths: [...manifest.readPaths] } : {}),
          ...(manifest.writePaths ? { writePaths: [...manifest.writePaths] } : {}),
          ...(manifest.resourceKeys ? { resourceKeys: [...manifest.resourceKeys] } : {}),
          ...(manifest.timeoutMs ? { timeoutMs: manifest.timeoutMs } : {}),
          ...(manifest.permissions ? { permissions: manifest.permissions } : {})
        };
      });
  }
}
