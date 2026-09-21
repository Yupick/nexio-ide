import { createHash } from 'node:crypto';

import type { AgentRuntimeSettings } from './config';
import { LlmManager } from './llm/llm-manager';
import type { LlmResponse } from './llm/types';
import { createProjectSnapshot } from './project-snapshot';
import type { IdeaChatRequest, IdeaChatResult } from '../shared/types';

const MAX_HISTORY_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_ACTIVE_FILE_LENGTH = 6000;
const MAX_PROJECT_FILES = 80;

function createSnapshotHash(snapshot: { name: string; rootPath: string; files: string[] }): string {
  return createHash('sha256')
    .update(JSON.stringify({ name: snapshot.name, rootPath: snapshot.rootPath, files: [...snapshot.files].sort() }))
    .digest('hex')
    .slice(0, 16);
}

function formatHistory(request: IdeaChatRequest): string {
  return request.history
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'agent') && typeof entry.text === 'string')
    .slice(-MAX_HISTORY_MESSAGES)
    .map((entry) => `${entry.role === 'user' ? 'User' : 'Ideas'}: ${entry.text.trim().slice(0, MAX_MESSAGE_LENGTH)}`)
    .filter((entry) => !entry.endsWith(': '))
    .join('\n');
}

function buildPrompt(request: IdeaChatRequest, snapshot: { name: string; files: string[] }): string {
  const context = request.context ?? {};
  const projectFiles = snapshot.files.slice(0, MAX_PROJECT_FILES).join(', ');
  const history = formatHistory(request);
  const activeFile = context.activeFile?.trim() || 'No active file';
  const activeFileContent = context.activeFileContent?.slice(0, MAX_ACTIVE_FILE_LENGTH).trim() || 'No active file content supplied.';

  return [
    `Project: ${snapshot.name}`,
    `Project files: ${projectFiles || 'No files found.'}`,
    `Active file: ${activeFile}`,
    `Active file context:\n${activeFileContent}`,
    history ? `Conversation history:\n${history}` : 'Conversation history: none',
    `User message:\n${request.message.trim()}`
  ].join('\n\n');
}

export class IdeaChatService {
  public constructor(private readonly llmManager: Pick<LlmManager, 'completeWithFallback'> = new LlmManager()) {}

  public async sendMessage(
    request: IdeaChatRequest,
    workspaceRoot: string,
    runtimeSettings: AgentRuntimeSettings
  ): Promise<IdeaChatResult> {
    const sessionId = request.sessionId?.trim();
    const message = request.message?.trim();
    if (!sessionId || !message) {
      return { ok: false, message: 'Idea chat requires a session id and message.' };
    }

    const snapshot = createProjectSnapshot(workspaceRoot);
    const snapshotHash = createSnapshotHash(snapshot);
    const taskId = `idea-chat-${Date.now()}`;
    const model = request.settings?.model?.trim() || runtimeSettings.model;
    const provider = request.settings?.provider || runtimeSettings.provider;
    const temperature = request.settings?.temperature ?? runtimeSettings.temperature;
    const prompt = buildPrompt({ ...request, sessionId, message }, snapshot);
    const response: LlmResponse = await this.llmManager.completeWithFallback({
      prompt,
      system: 'You are the Ideas Agent. Respond with a useful, read-only conversational proposal grounded in the supplied project context. Do not apply changes, call other agents, load plugins, or return an approval-ready patch.',
      temperature,
      model,
      metadata: {
        agent: 'ideas',
        taskId,
        snapshotHash
      }
    }, [provider, 'ollama', 'openai', 'gemini', 'grok', 'local']);

    const responseText = response.text.trim() || 'El agente de ideas no devolvió una respuesta.';
    const metadata = {
      taskId,
      snapshotHash,
      provider: response.metadata?.provider || response.provider,
      model: response.metadata?.model || model
    };

    return {
      ok: true,
      message: responseText,
      data: {
        sessionId,
        message: responseText,
        metadata
      }
    };
  }
}