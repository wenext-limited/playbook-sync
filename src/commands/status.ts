import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import { loadLockfile, isFileModified } from '../core/lockfile.js';
import { resolveSource } from '../core/source.js';
import { findProjectRoot, checksumFile } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import { type SyncFileStatus, type FileStatus } from '../types.js';

/**
 * Show sync status — which files are synced, modified locally, or outdated.
 */
export async function statusCommand(): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = loadConfig(projectRoot);
  const lockfile = loadLockfile(projectRoot);

  if (!lockfile) {
    logger.warn('No lockfile found. Run "pbs sync" first.');
    return;
  }

  for (const sourceConfig of config.sources) {
    const locked = lockfile.sources[sourceConfig.name];
    if (!locked) {
      logger.warn(`Source "${sourceConfig.name}" not synced yet.`);
      continue;
    }

    console.log('');
    logger.info(`Source: ${sourceConfig.name} @${locked.resolved_ref.slice(0, 8)}`);
    logger.dim(`  Synced at: ${locked.synced_at}`);

    // Check each target for modifications
    let hasLocalChanges = false;

    for (const [targetName, targetConfig] of Object.entries(config.targets)) {
      if (!targetConfig.enabled || !targetConfig.skills_path) continue;

      const targetDir = path.resolve(projectRoot, targetConfig.skills_path);
      if (!fs.existsSync(targetDir)) continue;

      // Check for locally modified files
      for (const lockedFile of locked.files) {
        // Map source file to target file
        const targetFile = mapSourceToTarget(lockedFile.path, targetName, targetConfig.skills_path);
        if (!targetFile) continue;

        const absoluteTarget = path.resolve(projectRoot, targetFile);
        if (!fs.existsSync(absoluteTarget)) {
          console.log(`    ${chalk.red('deleted')}  ${targetFile}`);
          hasLocalChanges = true;
          continue;
        }

        // Skip checksum comparison for format-converted targets (Cursor .mdc)
        // — these are always different from the source by design
        if (targetName === 'cursor') continue;

        const currentChecksum = checksumFile(absoluteTarget);
        if (currentChecksum !== lockedFile.checksum) {
          console.log(`    ${chalk.yellow('modified')} ${targetFile}`);
          hasLocalChanges = true;
        }
      }
    }

    if (!hasLocalChanges) {
      logger.success('  All files in sync.');
    } else {
      console.log('');
      logger.info('  Local changes detected. Use "pbs contribute" to push them back.');
    }

    // Check if source has new commits
    try {
      const resolved = await resolveSource(projectRoot, sourceConfig);
      if (resolved.resolved_ref !== locked.resolved_ref) {
        logger.warn(
          `  Source has new commits: ${locked.resolved_ref.slice(0, 8)} → ${resolved.resolved_ref.slice(0, 8)}`
        );
        logger.info('  Run "pbs sync" to update.');
      }
    } catch {
      logger.dim('  Could not check source for updates.');
    }
  }
}

function mapSourceToTarget(
  sourcePath: string,
  targetName: string,
  targetSkillsPath: string
): string | null {
  if (!sourcePath.startsWith('skills/')) return null;

  // Cursor uses .mdc format: skills/cocos-xxx/SKILL.md → .cursor/rules/cocos-xxx.mdc
  if (targetName === 'cursor') {
    const parts = sourcePath.split('/');
    if (parts.length >= 2) {
      const skillName = parts[1];
      // Only map SKILL.md — the main file per skill
      if (sourcePath.endsWith('/SKILL.md')) {
        return path.join(targetSkillsPath, `${skillName}.mdc`).replace(/\\/g, '/');
      }
    }
    return null;
  }

  // OpenCode / Claude: direct mapping skills/X/Y → target/X/Y
  const rest = sourcePath.slice('skills/'.length);
  return path.join(targetSkillsPath, rest).replace(/\\/g, '/');
}
