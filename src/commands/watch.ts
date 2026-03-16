import { watch } from 'chokidar';
import * as path from 'node:path';
import { loadConfig } from '../core/config.js';
import { syncAll } from '../core/sync-engine.js';
import { findProjectRoot } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import { CACHE_DIR } from '../types.js';

/**
 * Watch source directories for changes and auto-sync.
 * Useful during playbook development.
 */
export async function watchCommand(): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = loadConfig(projectRoot);

  if (config.sources.length === 0) {
    logger.warn('No sources configured. Run "pbs add <source>" first.');
    return;
  }

  // Collect paths to watch
  const watchPaths: string[] = [];
  for (const source of config.sources) {
    if (source.type === 'local' && source.path) {
      watchPaths.push(path.resolve(projectRoot, source.path));
    } else if (source.type === 'submodule' && source.path) {
      watchPaths.push(path.resolve(projectRoot, source.path));
    } else if (source.type === 'git') {
      // Watch the cached repo
      const url = source.url;
      if (url) {
        const repoHash = url.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
        const cachePath = path.join(projectRoot, CACHE_DIR, 'repos', repoHash);
        watchPaths.push(cachePath);
      }
    }
  }

  if (watchPaths.length === 0) {
    logger.warn('No watchable source paths found.');
    return;
  }

  logger.info('Watching for changes...');
  for (const p of watchPaths) {
    logger.dim(`  ${p}`);
  }
  logger.dim('Press Ctrl+C to stop.\n');

  // Initial sync
  await syncAll(projectRoot, config);

  // Debounced sync
  let syncTimeout: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(watchPaths, {
    ignoreInitial: true,
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      `**/${CACHE_DIR}/**`,
    ],
  });

  watcher.on('all', (event, filePath) => {
    if (syncTimeout) clearTimeout(syncTimeout);
    logger.dim(`  [${event}] ${filePath}`);
    syncTimeout = setTimeout(async () => {
      logger.info('Changes detected — re-syncing...');
      try {
        await syncAll(projectRoot, config);
      } catch (err) {
        logger.error(`Sync failed: ${err}`);
      }
    }, 500);
  });

  // Keep alive
  await new Promise(() => {});
}
