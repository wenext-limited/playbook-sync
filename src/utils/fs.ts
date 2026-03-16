import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Compute SHA-256 checksum of file content.
 */
export function checksumFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA-256 checksum of a string.
 */
export function checksumString(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Recursively copy a directory, creating parent dirs as needed.
 */
export function copyDirSync(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

/**
 * Recursively list all files in a directory (relative paths).
 */
export function listFilesSync(dir: string, base?: string): string[] {
  const result: string[] = [];
  const baseDir = base ?? dir;
  if (!fs.existsSync(dir)) return result;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesSync(fullPath, baseDir));
    } else {
      result.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return result;
}

/**
 * Ensure parent directory exists for a file path.
 */
export function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Remove a directory recursively if it exists.
 */
export function removeDirSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Find the project root (where playbook-sync.yaml is, or cwd).
 */
export function findProjectRoot(startDir?: string): string {
  let dir = startDir ?? process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, 'playbook-sync.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
