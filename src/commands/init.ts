import { createDefaultConfig, saveConfig } from '../core/config.js';
import { findProjectRoot } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import { CONFIG_FILENAME } from '../types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Initialize playbook-sync in the current project.
 * Creates a default playbook-sync.yaml.
 */
export async function initCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, CONFIG_FILENAME);

  if (fs.existsSync(configPath)) {
    logger.warn(`${CONFIG_FILENAME} already exists. Use "pbs add" to add sources.`);
    return;
  }

  const config = createDefaultConfig();
  saveConfig(projectRoot, config);

  logger.success(`Created ${CONFIG_FILENAME}`);
  logger.info('Next steps:');
  logger.dim('  1. Edit playbook-sync.yaml to enable the targets you need:');
  logger.dim('     opencode, cursor, copilot, claude (all disabled by default)');
  logger.dim('  2. pbs add <git-url>        # Add a playbook source');
  logger.dim('     pbs add --local <path>   # Or add a local source');
  logger.dim('  3. pbs sync                 # Sync playbook to AI tools');
}
