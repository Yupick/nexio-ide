/**
 * Read-only ideas agent.
 * It can inspect the project snapshot and roadmap, but never writes to disk.
 */
import type { AgentContext, AgentExecutionResult, AgentTask, Roadmap } from '../shared/types';

function buildAutocompleteExamples(task: AgentTask): string[] {
  const metadata = task.metadata ?? {};
  const prompt = String(metadata.prompt ?? '').trim();
  const editorContext = String(metadata.editorContext ?? '').trim();
  const language = String(metadata.language ?? 'typescript').toLowerCase();

  const normalizedPrompt = prompt || editorContext || 'generar una función útil';
  const seed = normalizedPrompt.toLowerCase();

  const examples: string[] = [];

  if (seed.includes('saludo') || seed.includes('greet') || seed.includes('hello')) {
    examples.push(
      'function greet(name: string): string {\n  return `Hola, ${name}!`;\n}',
      'const greet = (name: string) => `Hola, ${name}!`;'
    );
  }

  if (seed.includes('sumar') || seed.includes('calcular') || seed.includes('add') || seed.includes('total')) {
    examples.push(
      `function sumNumbers(a: number, b: number): number {\n  return a + b;\n}`,
      `const total = (values: number[]) => values.reduce((acc, value) => acc + value, 0);`
    );
  }

  if (seed.includes('filtrar') || seed.includes('filter') || seed.includes('buscar')) {
    examples.push(
      `const results = items.filter((item) => item.active === true);`,
      `function findByName(items: string[], query: string): string[] {\n  return items.filter((item) => item.toLowerCase().includes(query.toLowerCase()));\n}`
    );
  }

  if (examples.length === 0) {
    const baseName = editorContext.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? 'handler';
    examples.push(
      `function ${baseName}(): string {\n  return 'example';\n}`,
      `const ${baseName} = () => {\n  return 'example';\n};`
    );
  }

  if (language === 'python') {
    return [
      `def greet(name: str) -> str:\n    return f"Hola, {name}!"`,
      `def handler(value: str) -> str:\n    return value.strip().lower()`
    ];
  }

  return examples.slice(0, 3);
}

export class IdeasAgent {
  public async think(context: AgentContext, task: AgentTask): Promise<AgentExecutionResult> {
    const snapshot = context.snapshot;
    const roadmap = context.roadmap ?? ({ version: '0.1.0', summary: 'No roadmap yet.', tasks: [] } as Roadmap);

    const keyFiles = snapshot.files
      .filter((file) => /src\//.test(file) || /README|roadmap|ui_design/.test(file))
      .slice(0, 6);

    const suggestions = [
      `Project ${snapshot.name} currently exposes ${snapshot.files.length} tracked files.`,
      `Relevant files identified: ${keyFiles.join(', ') || 'none found'}.`,
      `Current roadmap has ${roadmap.tasks.length} task entries.`,
      `Suggested task: ${task.title}.`,
      `Recommended focus: review the execution path and keep changes within the sandbox-approved workspace.`
    ];

    const autocompleteExamples = buildAutocompleteExamples(task);

    return {
      ok: true,
      message: 'Ideas agent generated a read-only proposal grounded in the workspace snapshot and editor intent.',
      data: {
        taskId: task.id,
        suggestions,
        autocompleteExamples,
        readOnly: true,
        snapshotName: snapshot.name,
        keyFiles,
        projectRoot: snapshot.rootPath,
        prompt: String(task.metadata?.prompt ?? ''),
        editorContext: String(task.metadata?.editorContext ?? '')
      }
    };
  }
}
