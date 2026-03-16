import * as path from 'node:path';
import { type PlaybookSyncConfig, type ResolvedSource, type Lockfile } from '../types.js';
import { resolveSource } from './source.js';
import { loadLockfile, saveLockfile, updateLockfile, createLockedSource } from './lockfile.js';
import { getFormatter } from '../targets/index.js';
import { listFilesSync } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

export interface SyncResult {
  source: string;
  ref: string;
  filesWritten: number;
  targets: string[];
}

/**
 * Core sync engine.
 * Resolves sources → discovers content → writes to targets → updates lockfile.
 */
export async function syncAll(
  projectRoot: string,
  config: PlaybookSyncConfig
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  let lockfile = loadLockfile(projectRoot);

  if (config.sources.length === 0) {
    logger.warn('No sources configured. Run "pbs add <source>" first.');
    return results;
  }

  for (const sourceConfig of config.sources) {
    logger.info(`Syncing source: ${sourceConfig.name}`);

    // 1. Resolve source to local path
    const resolved = await resolveSource(projectRoot, sourceConfig);

    // 2. Write to each enabled target
    const writtenFiles: string[] = [];
    const targetNames: string[] = [];

    for (const [targetName, targetConfig] of Object.entries(config.targets)) {
      if (!targetConfig.enabled) continue;

      const formatter = getFormatter(targetName);
      if (!formatter) {
        logger.warn(`  Unknown target: ${targetName} — skipping`);
        continue;
      }

      const files = formatter.sync(projectRoot, resolved, targetConfig);
      writtenFiles.push(...files);
      targetNames.push(targetName);
    }

    // 3. Update lockfile
    const allSourceFiles = getAllSourceFiles(resolved);
    const lockedSource = createLockedSource(
      sourceConfig.type,
      resolved.resolved_ref,
      resolved.local_path,
      allSourceFiles,
      sourceConfig.url,
      sourceConfig.path
    );
    lockfile = updateLockfile(lockfile, sourceConfig.name, lockedSource);

    results.push({
      source: sourceConfig.name,
      ref: resolved.resolved_ref.slice(0, 8),
      filesWritten: writtenFiles.length,
      targets: targetNames,
    });
  }

  // Save lockfile
  saveLockfile(projectRoot, lockfile!);
  logger.success(`Lockfile updated.`);

  return results;
}

/**
 * Collect all file paths from a resolved source for lockfile tracking.
 */
function getAllSourceFiles(resolved: ResolvedSource): string[] {
  const files: string[] = [];

  // Skill files
  for (const skill of resolved.content.skills) {
    files.push(...skill.files);
  }

  // Rule files
  files.push(...resolved.content.rules);

  // AGENTS.md
  if (resolved.content.agents_md) {
    files.push('AGENTS.md');
  }

  return files;
}
