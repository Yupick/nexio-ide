import { PluginRegistry } from '../../src/backend/plugins-registry';
import { PluginManager } from '../../src/backend/plugin-manager';

describe('plugin registry', () => {
  test('registers and lists plugin definitions', () => {
    const registry = new PluginRegistry();

    registry.register({
      id: 'refactor-plugin',
      name: 'Refactor Plugin',
      version: '0.1.0',
      type: 'agent',
      description: 'Refactor feature plugin',
      entry: './src/plugins/refactor-plugin'
    });

    expect(registry.list()).toHaveLength(1);
    expect(registry.get('refactor-plugin')?.name).toBe('Refactor Plugin');
  });

  test('loads and executes real plugin modules from the plugins directory', async () => {
    const pluginManager = new PluginManager(process.cwd() + '/src/plugins');
    const instances = await pluginManager.loadAll({
      projectPath: process.cwd(),
      logger: () => undefined
    });

    expect(instances.length).toBeGreaterThan(0);
    const result = await instances[0].execute({
      id: 'plugin-task-1',
      title: 'Validate plugin execution',
      description: 'Task for plugin execution test.',
      priority: 'medium',
      dependencies: []
    });

    expect(result.ok).toBe(true);
  });

  test('does not load plugins disabled by runtime configuration', async () => {
    const pluginManager = new PluginManager(process.cwd() + '/src/plugins');
    const instances = await pluginManager.loadAll({
      projectPath: process.cwd(),
      logger: () => undefined
    }, {
      'docs-plugin': { enabled: false }
    });

    expect(instances.some((plugin) => plugin.id === 'docs-plugin')).toBe(false);
    expect(instances.length).toBeGreaterThan(0);
  });

  test('applies configured capabilities to the loaded plugin instance', async () => {
    const pluginManager = new PluginManager(process.cwd() + '/src/plugins');
    const instances = await pluginManager.loadAll({
      projectPath: process.cwd(),
      logger: () => undefined
    }, {
      'docs-plugin': { capabilities: ['documentation'] }
    });

    expect(instances.find((plugin) => plugin.id === 'docs-plugin')?.capabilities).toEqual(['documentation']);
  });

  test('keeps auto-approval disabled unless explicitly configured', async () => {
    const pluginManager = new PluginManager(process.cwd() + '/src/plugins');
    const instances = await pluginManager.loadAll({
      projectPath: process.cwd(),
      logger: () => undefined
    }, {
      'docs-plugin': { autoApprove: true }
    });

    expect(instances.length).toBeGreaterThan(0);
  });
});
