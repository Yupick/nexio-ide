/**
 * Diff engine that generates approval-ready patches for plugin output.
 */
export class DiffEngine {
  public static createPatch(before: string, after: string, filePath: string): string {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');

    const diffLines: string[] = [
      `--- ${filePath}`,
      `+++ ${filePath}`,
      '@@',
      ...beforeLines.map((line) => `-${line}`),
      ...afterLines.map((line) => `+${line}`)
    ];

    return diffLines.join('\n');
  }

  public static createApprovalSummary(taskTitle: string, pluginName: string, detail: string, filePath: string): string {
    const before = `# ${taskTitle}\n\nPending review\n`;
    const after = `# ${taskTitle}\n\n- plugin: ${pluginName}\n- summary: ${detail}\n- status: awaiting_review\n`;

    return this.createPatch(before, after, filePath);
  }
}
