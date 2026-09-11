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
}
