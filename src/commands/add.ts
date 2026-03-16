import { loadConfig, saveConfig } from '../core/config.js';
import { findProjectRoot } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import { type SourceConfig } from '../types.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface AddOptions {
  /** Source name override */
  name?: string;
  /** Git branch/tag/commit */
  ref?: string;
  /** Treat as local path source */
  local?: boolean;
  /** Treat as git submodule source */
  submodule?: boolean;
  /** Include patterns */
  include?: string[];
}

/**
 * Add a playbook source to the config.
 */
export async function addCommand(source: string, options: AddOptions): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = loadConfig(projectRoot);

  // Determine source type and config
  const sourceConfig = parseSource(source, options, projectRoot);

  // Check for duplicates
  const existing = config.sources.find(s => s.name === sourceConfig.name);
  if (existing) {
    logger.warn(`Source "${sourceConfig.name}" already exists. Updating...`);
    Object.assign(existing, sourceConfig);
  } else {
    config.sources.push(sourceConfig);
  }

  saveConfig(projectRoot, config);
  logger.success(`Added source: ${sourceConfig.name} (${sourceConfig.type})`);
  logger.info('Run "pbs sync" to fetch and sync content.');
}

function parseSource(source: string, options: AddOptions, projectRoot: string): SourceConfig {
  // Auto-detect type
  if (options.submodule) {
    const name = options.name ?? path.basename(source);
    return { name, type: 'submodule', path: source };
  }

  if (options.local) {
    const absPath = path.resolve(projectRoot, source);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Local path not found: ${absPath}`);
    }
    const name = options.name ?? path.basename(source);
    return { name, type: 'local', path: source };
  }

  // Check if it's a URL
  if (source.startsWith('http') || source.startsWith('git@') || source.includes('github.com')) {
    const name = options.name ?? extractRepoName(source);
    return {
      name,
      type: 'git',
      url: source,
      ref: options.ref ?? 'main',
    };
  }

  // Check if it's a local path
  const absPath = path.resolve(projectRoot, source);
  if (fs.existsSync(absPath)) {
    const name = options.name ?? path.basename(source);

    // Check if it's a git submodule
    const gitmodulesPath = path.join(projectRoot, '.gitmodules');
    if (fs.existsSync(gitmodulesPath)) {
      const content = fs.readFileSync(gitmodulesPath, 'utf-8');
      if (content.includes(source)) {
        return { name, type: 'submodule', path: source };
      }
    }

    return { name, type: 'local', path: source };
  }

  throw new Error(
    `Cannot determine source type for "${source}".\n` +
    'Use --local for local paths or provide a git URL.'
  );
}

function extractRepoName(url: string): string {
  // https://github.com/org/repo.git → repo
  const match = url.match(/\/([^\/]+?)(\.git)?$/);
  return match ? match[1] : 'playbook';
}
