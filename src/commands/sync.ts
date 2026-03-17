import { loadConfig } from '../core/config.js';
import { syncAll, type SyncOptions } from '../core/sync-engine.js';
import { findProjectRoot } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

export { type SyncOptions };

/**
 * Sync all configured playbook sources to AI tool directories.
 */
export async function syncCommand(options: SyncOptions = {}): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = loadConfig(projectRoot);

  if (options.dryRun) {
    logger.info('Starting sync (dry run)...\n');
  } else {
    logger.info('Starting sync...\n');
  }

  const results = await syncAll(projectRoot, config, options);

  if (results.length === 0) return;

  if (options.dryRun) return;

  // Summary
  console.log('');
  logger.info('Sync complete:');
  for (const r of results) {
    logger.dim(
      `  ${r.source} @${r.ref} → ${r.filesWritten} files → [${r.targets.join(', ')}]`
    );
  }
}
