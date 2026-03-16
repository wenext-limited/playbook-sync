import * as path from 'node:path';
import * as fs from 'node:fs';
import { type SourceConfig, type ResolvedSource, type DiscoveredContent } from '../types.js';
import { ensureGitRepo, getRepoHead } from '../utils/git.js';
import { discoverContent } from './discovery.js';
import { logger } from '../utils/logger.js';

/**
 * Resolve a source configuration to a local path with discovered content.
 */
export async function resolveSource(
  projectRoot: string,
  source: SourceConfig
): Promise<ResolvedSource> {
  switch (source.type) {
    case 'git':
      return resolveGitSource(projectRoot, source);
    case 'submodule':
      return resolveSubmoduleSource(projectRoot, source);
    case 'local':
      return resolveLocalSource(projectRoot, source);
    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }
}

async function resolveGitSource(
  projectRoot: string,
  source: SourceConfig
): Promise<ResolvedSource> {
  if (!source.url) {
    throw new Error(`Source "${source.name}" of type "git" requires a "url" field`);
  }

  const { repoPath, resolvedRef } = await ensureGitRepo(
    projectRoot,
    source.url,
    source.ref ?? 'main'
  );

  const content = discoverContent(repoPath, source.include);
  logger.success(`Resolved git source "${source.name}" at ${resolvedRef.slice(0, 8)}`);

  return { config: source, local_path: repoPath, resolved_ref: resolvedRef, content };
}

async function resolveSubmoduleSource(
  projectRoot: string,
  source: SourceConfig
): Promise<ResolvedSource> {
  if (!source.path) {
    throw new Error(`Source "${source.name}" of type "submodule" requires a "path" field`);
  }

  const fullPath = path.resolve(projectRoot, source.path);
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Submodule path not found: ${fullPath}\nRun "git submodule init && git submodule update" first.`
    );
  }

  const resolvedRef = await getRepoHead(fullPath);
  const content = discoverContent(fullPath, source.include);
  logger.success(`Resolved submodule source "${source.name}" at ${resolvedRef.slice(0, 8)}`);

  return { config: source, local_path: fullPath, resolved_ref: resolvedRef, content };
}

async function resolveLocalSource(
  projectRoot: string,
  source: SourceConfig
): Promise<ResolvedSource> {
  if (!source.path) {
    throw new Error(`Source "${source.name}" of type "local" requires a "path" field`);
  }

  const fullPath = path.resolve(projectRoot, source.path);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Local source path not found: ${fullPath}`);
  }

  // Try to get git ref, fallback to timestamp
  let resolvedRef: string;
  try {
    resolvedRef = await getRepoHead(fullPath);
  } catch {
    resolvedRef = `local-${Date.now()}`;
  }

  const content = discoverContent(fullPath, source.include);
  logger.success(`Resolved local source "${source.name}"`);

  return { config: source, local_path: fullPath, resolved_ref: resolvedRef, content };
}
