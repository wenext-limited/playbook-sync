import { loadConfig } from '../core/config.js';
import { syncAll } from '../core/sync-engine.js';
import { findProjectRoot } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

/**
 * Sync all configured playbook sources to AI tool directories.
 */
export async function syncCommand(): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = loadConfig(projectRoot);

  logger.info('Starting sync...\n');

  const results = await syncAll(projectRoot, config);

  if (results.length === 0) return;

  // Summary
  console.log('');
  logger.info('Sync complete:');
  for (const r of results) {
    logger.dim(
      `  ${r.source} @${r.ref} → ${r.filesWritten} files → [${r.targets.join(', ')}]`
    );
  }
}
