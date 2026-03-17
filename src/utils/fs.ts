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

// ─── .gitignore management ───

const GITIGNORE_MARKER_START = '# >>> playbook-sync managed (DO NOT EDIT) >>>';
const GITIGNORE_MARKER_END = '# <<< playbook-sync managed <<<';

/**
 * Collect all output paths that should be git-ignored based on enabled targets.
 *
 * For directory-based targets (opencode, claude, cursor), uses the base directory
 * (parent of skills_path) to cover all synced content (skills, rules, agents, docs, etc.).
 */
export function collectIgnorePaths(
  targets: Record<string, { enabled: boolean; skills_path?: string; agents_md?: string; mode?: string }>
): string[] {
  const paths: string[] = [];

  // Always ignore pbs config, lockfile, and cache directory
  paths.push('playbook-sync.yaml');
  paths.push('playbook-sync.lock.yaml');
  paths.push('.playbook-sync/');

  for (const [_name, config] of Object.entries(targets)) {
    if (!config.enabled) continue;

    if (config.skills_path) {
      // Normalize: ensure trailing slash for directories, no trailing slash for files
      const p = config.skills_path.replace(/\\/g, '/');
      if (p.endsWith('.md')) {
        // Single file target (e.g. copilot-instructions.md)
        paths.push(p);
      } else {
        // Directory target — use base directory to cover all synced content
        // e.g. '.opencode/skills' → '.opencode/' covers skills/, rules/, agents/, docs/, etc.
        const basePath = path.dirname(p).replace(/\\/g, '/');
        const baseEntry = basePath.endsWith('/') ? basePath : basePath + '/';
        if (!paths.includes(baseEntry)) {
          paths.push(baseEntry);
        }
      }
    }

    // AGENTS.md at project root
    if (config.agents_md) {
      const agentsMd = config.agents_md.replace(/\\/g, '/');
      if (!paths.includes(agentsMd)) {
        paths.push(agentsMd);
      }
    }
  }

  return paths;
}

/**
 * Update the project's .gitignore to include playbook-sync managed entries.
 * Uses marker comments to manage a dedicated block — existing user content is preserved.
 *
 * @returns true if the file was updated, false if already up-to-date or no .gitignore exists.
 */
export function updateGitignore(projectRoot: string, ignorePaths: string[]): boolean {
  const gitignorePath = path.join(projectRoot, '.gitignore');

  // Only update if .gitignore already exists (don't create one in non-git projects)
  if (!fs.existsSync(gitignorePath)) {
    return false;
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8');

  // Build the managed block
  const managedBlock = [
    GITIGNORE_MARKER_START,
    ...ignorePaths,
    GITIGNORE_MARKER_END,
  ].join('\n');

  // Check if there is already a managed block
  const blockRegex = new RegExp(
    escapeRegExp(GITIGNORE_MARKER_START) +
    '[\\s\\S]*?' +
    escapeRegExp(GITIGNORE_MARKER_END),
    'm'
  );
  const existingMatch = content.match(blockRegex);

  let newContent: string;

  if (existingMatch) {
    // Replace existing block
    if (existingMatch[0] === managedBlock) {
      // Already up-to-date
      return false;
    }
    newContent = content.replace(blockRegex, managedBlock);
  } else {
    // Append block at the end
    const trimmed = content.trimEnd();
    newContent = trimmed + '\n\n' + managedBlock + '\n';
  }

  fs.writeFileSync(gitignorePath, newContent, 'utf-8');
  return true;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
