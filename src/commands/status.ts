import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import { loadLockfile } from '../core/lockfile.js';
import { resolveSource } from '../core/source.js';
import { findProjectRoot, checksumFile } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import {
  getSnapshotChecksum,
  detectModificationType,
  type ModificationType,
} from '../core/snapshot.js';

/**
 * Show sync status — which files are synced, modified locally, outdated, or conflicting.
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

    // Resolve current source to get remote checksums
    let remoteChecksums: Map<string, string> | null = null;
    let remoteRef: string | null = null;
    try {
      const resolved = await resolveSource(projectRoot, sourceConfig);
      remoteRef = resolved.resolved_ref;
      remoteChecksums = new Map();

      // Skills
      for (const skill of resolved.content.skills) {
        for (const file of skill.files) {
          const absPath = path.join(resolved.local_path, file);
          if (fs.existsSync(absPath)) {
            remoteChecksums.set(file, checksumFile(absPath));
          }
        }
      }

      // skills/README.md
      if (resolved.content.skills_readme) {
        remoteChecksums.set('skills/README.md', checksumFile(resolved.content.skills_readme));
      }

      // AGENTS.md
      if (resolved.content.agents_md) {
        remoteChecksums.set('AGENTS.md', checksumFile(resolved.content.agents_md));
      }

      // CLAUDE.md
      if (resolved.content.claude_md) {
        remoteChecksums.set('CLAUDE.md', checksumFile(resolved.content.claude_md));
      }

      // README.md
      if (resolved.content.readme) {
        remoteChecksums.set('README.md', checksumFile(resolved.content.readme));
      }

      // Rules
      for (const rulePath of resolved.content.rules) {
        const absPath = path.join(resolved.local_path, rulePath);
        if (fs.existsSync(absPath)) {
          remoteChecksums.set(rulePath, checksumFile(absPath));
        }
      }

      // Agents directory
      for (const agentPath of resolved.content.agents_dir) {
        const absPath = path.join(resolved.local_path, agentPath);
        if (fs.existsSync(absPath)) {
          remoteChecksums.set(agentPath, checksumFile(absPath));
        }
      }

      // Docs
      for (const docPath of resolved.content.other_docs) {
        const absPath = path.join(resolved.local_path, docPath);
        if (fs.existsSync(absPath)) {
          remoteChecksums.set(docPath, checksumFile(absPath));
        }
      }

      // new_project_code
      for (const codePath of resolved.content.new_project_code) {
        const absPath = path.join(resolved.local_path, codePath);
        if (fs.existsSync(absPath)) {
          remoteChecksums.set(codePath, checksumFile(absPath));
        }
      }
    } catch {
      logger.dim('  Could not check source for updates.');
    }

    // Check each target for modifications
    let localModCount = 0;
    let sourceModCount = 0;
    let conflictCount = 0;

    for (const [targetName, targetConfig] of Object.entries(config.targets)) {
      if (!targetConfig.enabled || !targetConfig.skills_path) continue;

      // Skip format-converted targets (Cursor .mdc) and merge-mode targets (Copilot)
      if (targetName === 'cursor') continue;
      if (targetConfig.mode === 'merge') continue;

      for (const lockedFile of locked.files) {
        const targetFile = mapSourceToTarget(lockedFile.path, targetName, targetConfig.skills_path);
        if (!targetFile) continue;

        const absoluteTarget = path.resolve(projectRoot, targetFile);

        // Three-way comparison
        // Fall back to lockfile checksum as "base" when no snapshot exists yet
        const snapshotChecksum = getSnapshotChecksum(projectRoot, sourceConfig.name, targetFile);
        const baseChecksum = snapshotChecksum ?? lockedFile.checksum;
        const localChecksum = fs.existsSync(absoluteTarget) ? checksumFile(absoluteTarget) : null;
        const remoteChecksum = remoteChecksums?.get(lockedFile.path) ?? lockedFile.checksum;

        if (localChecksum === null) {
          console.log(`    ${chalk.red('deleted')}          ${targetFile}`);
          localModCount++;
          continue;
        }

        const modType = detectModificationType(baseChecksum, localChecksum, remoteChecksum);

        switch (modType) {
          case 'modified_local':
            console.log(`    ${chalk.yellow('modified_local')}   ${targetFile}`);
            localModCount++;
            break;
          case 'modified_source':
            console.log(`    ${chalk.blue('modified_source')}  ${targetFile}`);
            sourceModCount++;
            break;
          case 'conflict':
            console.log(`    ${chalk.red('conflict')}         ${targetFile}`);
            conflictCount++;
            break;
          // unmodified — no output
        }
      }
    }

    const hasIssues = localModCount > 0 || sourceModCount > 0 || conflictCount > 0;

    if (!hasIssues) {
      logger.success('  All files in sync.');
    } else {
      console.log('');
      if (localModCount > 0) {
        logger.info(`  ${localModCount} file(s) modified locally. Use "pbs contribute" to push back.`);
      }
      if (sourceModCount > 0) {
        logger.info(`  ${sourceModCount} file(s) updated in source. Run "pbs sync" to update.`);
      }
      if (conflictCount > 0) {
        logger.warn(`  ${conflictCount} file(s) conflicting (both local and source changed).`);
        logger.info('  Options: "pbs contribute" first, then "pbs sync", or "pbs sync --force".');
      }
    }

    // Check for new commits
    if (remoteRef && remoteRef !== locked.resolved_ref) {
      logger.warn(
        `  Source has new commits: ${locked.resolved_ref.slice(0, 8)} → ${remoteRef.slice(0, 8)}`
      );
      logger.info('  Run "pbs sync" to update.');
    }
  }
}

function mapSourceToTarget(
  sourcePath: string,
  targetName: string,
  targetSkillsPath: string
): string | null {
  // Cursor uses .mdc format — skip
  if (targetName === 'cursor') return null;
  // Copilot merges into a single file — skip individual file tracking
  if (targetName === 'copilot') return null;

  const basePath = path.dirname(targetSkillsPath); // e.g. '.opencode'

  // Skills: skills/X/Y → target_skills_path/X/Y
  if (sourcePath.startsWith('skills/')) {
    const rest = sourcePath.slice('skills/'.length);
    return path.join(targetSkillsPath, rest).replace(/\\/g, '/');
  }

  // AGENTS.md → project root
  if (sourcePath === 'AGENTS.md') return 'AGENTS.md';

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
    return path.join(basePath, sourcePath).replace(/\\/g, '/');
  }

  return null;
}
