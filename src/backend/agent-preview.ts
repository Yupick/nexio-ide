/**
 * Small helper to build a safe preview from the agent workflow result.
 * It prevents undefined or empty values from breaking the UI preview state.
 */

export interface WorkflowPreviewInput {
  ideaSuggestions?: string[];
  autocompleteExamples?: string[];
  roadmapTasks?: Array<{ title?: string; description?: string }>;
  principalMessage?: string;
  fallbackPrompt?: string;
}

export interface WorkflowPreviewResult {
  taskPreview: string;
  pendingPatch: string;
  suggestionsText: string;
}

export function buildWorkflowPreview(input: WorkflowPreviewInput): WorkflowPreviewResult {
  const ideaSuggestions = Array.isArray(input.ideaSuggestions) ? input.ideaSuggestions.filter(Boolean) : [];
  const autocompleteExamples = Array.isArray(input.autocompleteExamples) ? input.autocompleteExamples.filter(Boolean) : [];
  const roadmapTasks = Array.isArray(input.roadmapTasks) ? input.roadmapTasks.filter(Boolean) : [];

  const messages: string[] = [];
  if (ideaSuggestions.length > 0) {
    messages.push(...ideaSuggestions.map((entry) => `• ${entry}`));
  }

  const taskPreview = roadmapTasks.length > 0
    ? roadmapTasks.map((task) => `- ${task.title ?? 'Task'}: ${task.description ?? 'No description provided.'}`).join('\n')
    : input.principalMessage || input.fallbackPrompt || 'No roadmap tasks produced yet.';

  const pendingPatch = autocompleteExamples.length > 0
    ? autocompleteExamples[0]
    : input.principalMessage || input.fallbackPrompt || taskPreview || 'No patch generated.';

  const suggestionsText = ideaSuggestions.length > 0
    ? ideaSuggestions.join('\n')
    : input.principalMessage || input.fallbackPrompt || 'Ideas mode complete.';

  return {
    taskPreview,
    pendingPatch,
    suggestionsText
  };
}
