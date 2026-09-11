/**
 * Minimal sandbox abstraction that limits file access to a known root.
 * This keeps dangerous writes outside the project working directory blocked.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface SandboxOptions {
  allowedRoots: string[];
  readOnly?: boolean;
}

export class Sandbox {
  private readonly allowedRoots: string[];
  private readonly readOnly: boolean;

  constructor(options: SandboxOptions) {
    this.allowedRoots = options.allowedRoots.map((root) => {
      const resolvedRoot = path.resolve(root);
      return fs.existsSync(resolvedRoot) ? fs.realpathSync(resolvedRoot) : resolvedRoot;
    });
    this.readOnly = options.readOnly ?? false;
  }

  private isWithinRoot(targetPath: string, rootPath: string): boolean {
    const relativePath = path.relative(rootPath, targetPath);
    return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath));
  }

  private resolveWithinAllowedRoot(targetPath: string): string {
    const absoluteTarget = path.resolve(targetPath);

    const existingParent = (() => {
      let current = absoluteTarget;
      while (!fs.existsSync(current) && path.dirname(current) !== current) {
        current = path.dirname(current);
      }
      return current;
    })();

    const realTarget = fs.existsSync(absoluteTarget)
      ? fs.realpathSync(absoluteTarget)
      : fs.existsSync(existingParent)
        ? path.join(fs.realpathSync(existingParent), path.relative(existingParent, absoluteTarget))
        : absoluteTarget;

    const isAllowed = this.allowedRoots.some((root) => this.isWithinRoot(realTarget, root));

    if (!isAllowed) {
      throw new Error(`Access denied: ${targetPath} is outside the sandbox root.`);
    }

    return realTarget;
  }

  public readText(filePath: string): string {
    const safePath = this.resolveWithinAllowedRoot(filePath);
    return fs.readFileSync(safePath, 'utf8');
  }

  public writeText(filePath: string, content: string): void {
    if (this.readOnly) {
      throw new Error('Sandbox is read-only and cannot write files.');
    }

    const safePath = this.resolveWithinAllowedRoot(filePath);
    fs.mkdirSync(path.dirname(safePath), { recursive: true });
    fs.writeFileSync(safePath, content, 'utf8');
  }

  public listFiles(rootPath: string): string[] {
    const safeRoot = this.resolveWithinAllowedRoot(rootPath);
    return fs.readdirSync(safeRoot, { withFileTypes: true }).flatMap((entry) => {
      const fullPath = path.join(safeRoot, entry.name);
      return entry.isDirectory() ? this.listFiles(fullPath) : [fullPath];
    });
  }
}
