/**
 * Prompt manager centralizes versioned prompt templates.
 */
export interface PromptTemplate {
  name: string;
  version: string;
  content: string;
}

export class PromptManager {
  private readonly templates: Map<string, PromptTemplate>;

  constructor() {
    this.templates = new Map();

    this.register({
      name: 'ideas',
      version: '1.0.0',
      content: `You are the Ideas agent. Review the project snapshot for {{project}} and propose coherent features without writing files directly. Target language: {{language}}.`
    });

    this.register({
      name: 'planning',
      version: '1.0.0',
      content: `You are the Planning agent. Convert ideas into a JSON roadmap with tasks, dependencies, and priorities. Target language: {{language}}.`
    });

    this.register({
      name: 'principal',
      version: '1.0.0',
      content: `You are the Principal agent orchestrating execution for {{project}}. Use the {{provider}} provider and the {{language}} language, then stage reviewable execution output.`
    });

    this.register({
      name: 'orchestrator',
      version: '1.0.0',
      content: `You are the {{agent}} agent for {{project}}. Coordinate ideas, planning, and validation using the {{provider}} provider for {{language}} code tasks. Focus on clear review gates and traceable execution.`
    });
  }

  public register(template: PromptTemplate): void {
    this.templates.set(`${template.name}:${template.version}`, template);
  }

  public render(name: string, variables: Record<string, string> = {}): string {
    const template = this.getLatest(name) ?? this.getLatest('orchestrator') ?? this.getLatest('principal') ?? this.getLatest('planning') ?? this.getLatest('ideas');
    if (!template) {
      throw new Error(`Prompt template ${name} was not found.`);
    }

    return template.content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => variables[key] ?? '');
  }

  public getLatest(name: string): PromptTemplate | undefined {
    const matches = [...this.templates.entries()]
      .filter(([key]) => key.startsWith(`${name}:`))
      .map(([, template]) => template)
      .sort((a, b) => a.version.localeCompare(b.version));

    return matches.at(-1);
  }
}
