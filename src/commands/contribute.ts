import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadConfig } from '../core/config.js';
import { loadLockfile } from '../core/lockfile.js';
import { resolveSource } from '../core/source.js';
import { findProjectRoot, checksumFile } from '../utils/fs.js';
import { commitAndPush } from '../utils/git.js';
import { logger } from '../utils/logger.js';

export interface ContributeOptions {
  /** Source name to contribute to (default: first source) */
  source?: string;
  /** Branch name for the contribution */
  branch?: string;
  /** Commit message */
  message?: string;
  /** Auto-push to remote */
  push?: boolean;
  /** Dry run — show what would be contributed */
  dryRun?: boolean;
}

/**
 * Contribute local changes back to the playbook source.
 *
 * Flow:
 * 1. Detect which target files were modified (compared to lockfile checksums)
 * 2. Map modified target files back to source paths
 * 3. Copy modified content back to source directory
 * 4. Optionally commit and push
 */
export async function contributeCommand(options: ContributeOptions): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = loadConfig(projectRoot);
  const lockfile = loadLockfile(projectRoot);

  if (!lockfile) {
    logger.error('No lockfile found. Run "pbs sync" first.');
    return;
  }

  // Find the source to contribute to
  const sourceName = options.source ?? config.sources[0]?.name;
  if (!sourceName) {
    logger.error('No sources configured.');
    return;
  }

  const sourceConfig = config.sources.find(s => s.name === sourceName);
  if (!sourceConfig) {
    logger.error(`Source "${sourceName}" not found.`);
    return;
  }

  const locked = lockfile.sources[sourceName];
  if (!locked) {
    logger.error(`Source "${sourceName}" not synced yet. Run "pbs sync" first.`);
    return;
  }

  // Determine the source local path
  const sourceLocalPath = resolveSourcePath(projectRoot, sourceConfig, locked);
  if (!sourceLocalPath || !fs.existsSync(sourceLocalPath)) {
    logger.error(`Cannot locate source repository. Make sure it exists locally.`);
    logger.info('For git sources, run "pbs sync" first to populate the cache.');
    return;
  }

  // Find modified files across all targets
  const modifications: Array<{
    sourcePath: string;
    targetPath: string;
    absoluteTarget: string;
  }> = [];

  for (const [targetName, targetConfig] of Object.entries(config.targets)) {
    if (!targetConfig.enabled || !targetConfig.skills_path) continue;

    // Skip format-converted targets (Cursor .mdc) — checksum comparison is
    // unreliable because the output format differs from the source.
    // Users should contribute via an OpenCode/Claude target instead.
    if (targetName === 'cursor') continue;

    for (const lockedFile of locked.files) {
      // Find the target file(s) that correspond to this source file
      const targetRelPath = mapSourceToTarget(
        lockedFile.path,
        targetName,
        targetConfig.skills_path
      );
      if (!targetRelPath) continue;

      const absoluteTarget = path.resolve(projectRoot, targetRelPath);
      if (!fs.existsSync(absoluteTarget)) continue;

      const currentChecksum = checksumFile(absoluteTarget);
      if (currentChecksum !== lockedFile.checksum) {
        modifications.push({
          sourcePath: lockedFile.path,
          targetPath: targetRelPath,
          absoluteTarget,
        });
      }
    }
  }

  if (modifications.length === 0) {
    logger.success('No local modifications detected. Nothing to contribute.');
    return;
  }

  // Deduplicate by source path (same source file might be in multiple targets)
  const uniqueMods = new Map<string, typeof modifications[0]>();
  for (const mod of modifications) {
    if (!uniqueMods.has(mod.sourcePath)) {
      uniqueMods.set(mod.sourcePath, mod);
    }
  }

  // Report
  logger.info(`Found ${uniqueMods.size} modified file(s) to contribute:`);
  for (const [sourcePath, mod] of uniqueMods) {
    logger.dim(`  ${mod.targetPath} → ${sourcePath}`);
  }

  if (options.dryRun) {
    logger.info('Dry run — no changes applied.');
    return;
  }

  // Pre-check: warn if source has newer commits than what we synced from
  try {
    const resolved = await resolveSource(projectRoot, sourceConfig);
    if (resolved.resolved_ref !== locked.resolved_ref) {
      logger.warn(
        `Source has been updated since last sync: ${locked.resolved_ref.slice(0, 8)} → ${resolved.resolved_ref.slice(0, 8)}`
      );
      logger.warn(
        'Your changes may conflict with newer source content.'
      );
      logger.info(
        'Consider running "pbs sync --force" first, then re-apply your changes.'
      );
      logger.info(
        'Proceeding with contribute anyway...\n'
      );
    }
  } catch {
    // Could not check — proceed anyway
  }

  // Copy changes back to source
  const copiedFiles: string[] = [];
  for (const [sourcePath, mod] of uniqueMods) {
    const dstPath = path.join(sourceLocalPath, sourcePath);
    const dstDir = path.dirname(dstPath);
    fs.mkdirSync(dstDir, { recursive: true });

    // For cursor .mdc files, strip frontmatter before copying back
    if (mod.absoluteTarget.endsWith('.mdc')) {
      const content = fs.readFileSync(mod.absoluteTarget, 'utf-8');
      const stripped = stripMdcFrontmatter(content);
      fs.writeFileSync(dstPath, stripped, 'utf-8');
    } else {
      fs.copyFileSync(mod.absoluteTarget, dstPath);
    }

    copiedFiles.push(sourcePath);
    logger.success(`  Copied: ${sourcePath}`);
  }

  // Optionally commit and push
  if (options.push) {
    const branch = options.branch ?? `contribute/${Date.now()}`;
    const message = options.message ?? `chore: contribute changes from project`;

    logger.info('Committing and pushing...');
    await commitAndPush(sourceLocalPath, branch, message, copiedFiles);
    logger.success(`Pushed to branch: ${branch}`);
    logger.info('Create a Pull Request to merge your changes.');
  } else {
    logger.info('Changes copied to source. To commit:');
    logger.dim(`  cd ${sourceLocalPath}`);
    logger.dim(`  git add . && git commit -m "your message"`);
    logger.dim(`  git push`);
  }
}

function resolveSourcePath(
  projectRoot: string,
  sourceConfig: { type: string; path?: string; url?: string },
  locked: { path?: string; url?: string }
): string | null {
  if (sourceConfig.type === 'submodule' || sourceConfig.type === 'local') {
    const p = sourceConfig.path ?? locked.path;
    return p ? path.resolve(projectRoot, p) : null;
  }

  // For git sources, use the cache directory
  const url = sourceConfig.url ?? locked.url;
  if (!url) return null;

  const repoHash = url.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  const cachePath = path.join(projectRoot, '.playbook-sync', 'repos', repoHash);
  return fs.existsSync(cachePath) ? cachePath : null;
}

function mapSourceToTarget(
  sourcePath: string,
  targetName: string,
  targetSkillsPath: string
): string | null {
  const basePath = path.dirname(targetSkillsPath); // e.g. '.opencode'

  if (sourcePath.startsWith('skills/')) {
    // Cursor uses .mdc format: skills/cocos-xxx/SKILL.md → .cursor/rules/cocos-xxx.mdc
    if (targetName === 'cursor') {
      const parts = sourcePath.split('/');
      if (parts.length >= 2 && sourcePath.endsWith('/SKILL.md')) {
        const skillName = parts[1];
        return path.join(targetSkillsPath, `${skillName}.mdc`).replace(/\\/g, '/');
      }
      return null;
    }

    // OpenCode / Claude: direct mapping skills/X/Y → target/X/Y
    const rest = sourcePath.slice('skills/'.length);
    return path.join(targetSkillsPath, rest).replace(/\\/g, '/');
  }

  if (sourcePath === 'AGENTS.md') {
    return 'AGENTS.md';
  }

  // CLAUDE.md → basePath/CLAUDE.md
  if (sourcePath === 'CLAUDE.md') {
    return path.join(basePath, 'CLAUDE.md').replace(/\\/g, '/');
  }

  // README.md → basePath/README.md
  if (sourcePath === 'README.md') {
    return path.join(basePath, 'README.md').replace(/\\/g, '/');
  }

  // rules/, agents/, docs/, new_project_code/ → basePath/<path>
  if (
    sourcePath.startsWith('rules/') ||
    sourcePath.startsWith('agents/') ||
    sourcePath.startsWith('docs/') ||
    sourcePath.startsWith('new_project_code/')
  ) {
    // Cursor: convert rules and agents to .mdc
    if (targetName === 'cursor') {
      if (sourcePath.startsWith('rules/') && sourcePath.endsWith('.md')) {
        const ruleName = path.basename(sourcePath, '.md');
        return path.join(targetSkillsPath, `rule-${ruleName}.mdc`).replace(/\\/g, '/');
      }
      if (sourcePath.startsWith('agents/') && sourcePath.endsWith('.md')) {
        const agentName = path.basename(sourcePath, '.md');
        return path.join(targetSkillsPath, `agent-${agentName}.mdc`).replace(/\\/g, '/');
      }
      return null;
    }

    return path.join(basePath, sourcePath).replace(/\\/g, '/');
  }

  return null;
}

/**
 * Strip Cursor .mdc frontmatter to get back the original markdown.
 */
function stripMdcFrontmatter(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?---\s*\n(.*)$/s);
  return match ? match[1].trimStart() : content;
}
