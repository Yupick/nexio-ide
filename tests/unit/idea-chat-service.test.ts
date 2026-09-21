import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { IdeaChatService } from '../../src/backend/idea-chat-service';
import { LlmManager } from '../../src/backend/llm/llm-manager';
import type { IdeaChatRequest } from '../../src/shared/types';

const runtimeSettings = {
  provider: 'local' as const,
  agent: 'ideas' as const,
  model: 'local-model',
  baseUrl: 'http://localhost',
  apiKey: '',
  temperature: 0.2
};

function createWorkspace(): string {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-idea-chat-'));
  fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'src', 'app.ts'), 'export const app = true;\n', 'utf8');
  return workspaceRoot;
}

describe('idea chat service', () => {
  test('uses the LLM manager fallback path and returns response metadata', async () => {
    const workspaceRoot = createWorkspace();
    const result = await new IdeaChatService(new LlmManager()).sendMessage({
      sessionId: 'session-1',
      message: '¿Qué debería revisar primero?',
      history: [],
      settings: { provider: 'local', model: 'local-model' }
    }, workspaceRoot, runtimeSettings);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      sessionId: 'session-1',
      message: expect.stringContaining('Local stub response'),
      metadata: {
        taskId: expect.stringMatching(/^idea-chat-/),
        snapshotHash: expect.stringMatching(/^[a-f0-9]{16}$/),
        provider: 'local',
        model: 'local-model'
      }
    });
  });

  test('passes limited history and active project context to one Ideas LLM call', async () => {
    const workspaceRoot = createWorkspace();
    const completeWithFallback = jest.fn().mockResolvedValue({
      provider: 'local',
      text: 'Respuesta contextual',
      metadata: { provider: 'local', model: 'local-model' }
    });
    const request: IdeaChatRequest = {
      sessionId: 'session-history',
      message: 'Continúa con esa revisión',
      history: [
        { role: 'user', text: 'Primera pregunta' },
        { role: 'agent', text: 'Primera respuesta' }
      ],
      context: {
        activeFile: 'src/app.ts',
        activeFileContent: 'export const app = true;',
        project: { name: 'nexio-ide' }
      },
      settings: { provider: 'local', model: 'local-model', temperature: 0.3 }
    };

    const result = await new IdeaChatService({ completeWithFallback }).sendMessage(request, workspaceRoot, runtimeSettings);

    expect(result).toMatchObject({ ok: true, data: { sessionId: 'session-history', message: 'Respuesta contextual' } });
    expect(completeWithFallback).toHaveBeenCalledTimes(1);
    expect(completeWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'local-model',
        temperature: 0.3,
        metadata: expect.objectContaining({ agent: 'ideas' }),
        prompt: expect.any(String)
      }),
      expect.arrayContaining(['local', 'ollama', 'openai', 'gemini', 'grok'])
    );
    const prompt = String(completeWithFallback.mock.calls[0][0].prompt);
    expect(prompt).toContain('Primera pregunta');
    expect(prompt).toContain('src/app.ts');
    expect(prompt).toContain('export const app');
  });

  test('does not depend on planning, orchestrator, principal, or plugin modules', () => {
    const serviceSource = fs.readFileSync(path.resolve(__dirname, '../../src/backend/idea-chat-service.ts'), 'utf8');

    expect(serviceSource).not.toMatch(/PlanningAgent|PrincipalAgent|AgentOrchestrator|PluginManager|WorkflowRuntime/);
    expect(serviceSource).toContain('completeWithFallback');
  });
});