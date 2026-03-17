import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type PlaybookSyncConfig,
  type ResolvedSource,
  type SourceConfig,
  type TargetConfig,
} from '../types.js';
import { resolveSource } from './source.js';
import { loadLockfile, saveLockfile, updateLockfile, createLockedSource } from './lockfile.js';
import { getFormatter } from '../targets/index.js';
import { listFilesSync, collectIgnorePaths, updateGitignore, checksumFile } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import {
  saveSnapshot,
  getSnapshotChecksum,
  detectModificationType,
  type FileModification,
  type ModificationType,
} from './snapshot.js';
import { backupFiles } from './backup.js';

// ─── Public types ───

export interface SyncOptions {
  /** Only show what would happen, don't write anything */
  dryRun?: boolean;
  /** Force overwrite even if local modifications exist (auto-backup first) */
  force?: boolean;
}

export interface SyncResult {
  source: string;
  ref: string;
  filesWritten: number;
  targets: string[];
}

// ─── Internal types ───

interface TargetFileMapping {
  /** Relative path inside the target (e.g. .claude/skills/cocos-audio/SKILL.md) */
  targetRelPath: string;
  /** Absolute path of the target file in the project */
  targetAbsPath: string;
  /** Relative path inside the source (e.g. skills/cocos-audio/SKILL.md) */
  sourceRelPath: string;
  /** Absolute path of the source file */
  sourceAbsPath: string;
  /** Target name (e.g. claude, opencode) */
  targetName: string;
}

// ─── Core sync engine ───

/**
 * Core sync engine.
 * Resolves sources → pre-check → backup → write to targets → snapshot → lockfile.
 */
export async function syncAll(
  projectRoot: string,
  config: PlaybookSyncConfig,
  options: SyncOptions = {}
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  let lockfile = loadLockfile(projectRoot);

  if (config.sources.length === 0) {
    logger.warn('No sources configured. Run "pbs add <source>" first.');
    return results;
  }

  // Check if any target is enabled
  const enabledTargets = Object.entries(config.targets).filter(([, t]) => t.enabled);
  if (enabledTargets.length === 0) {
    logger.warn(
      'No targets enabled. Edit playbook-sync.yaml and set "enabled: true" for the targets you need (opencode, cursor, copilot, claude).'
    );
    return results;
  }

  for (const sourceConfig of config.sources) {
    logger.info(`Syncing source: ${sourceConfig.name}`);

    // 1. Resolve source to local path
    const resolved = await resolveSource(projectRoot, sourceConfig);

    // 2. Build file mapping: what will be written and where
    const fileMappings = buildFileMappings(projectRoot, resolved, config.targets);

    // 3. Pre-sync check: detect local modifications via three-way comparison
    // Build lockfile checksum map for fallback when snapshots don't exist yet
    const locked = lockfile?.sources[sourceConfig.name];
    const lockfileChecksums = new Map<string, string>();
    if (locked) {
      for (const f of locked.files) {
        lockfileChecksums.set(f.path, f.checksum);
      }
    }

    const modifications = detectAllModifications(
      projectRoot,
      sourceConfig.name,
      fileMappings,
      lockfileChecksums
    );

    const localMods = modifications.filter(m => m.type === 'modified_local');
    const conflicts = modifications.filter(m => m.type === 'conflict');
    const hasLocalChanges = localMods.length > 0 || conflicts.length > 0;

    // 4. Handle dry-run
    if (options.dryRun) {
      printDryRunReport(modifications);
      continue;
    }

    // 5. If local changes exist and --force not set → abort
    if (hasLocalChanges && !options.force) {
      printBlockedReport(localMods, conflicts);
      // Still update lockfile? No — abort entirely for this source
      continue;
    }

    // 6. If --force and local changes → backup first
    if (hasLocalChanges && options.force) {
      const filesToBackup = [...localMods, ...conflicts].map(m => ({
        relativePath: m.targetPath,
        absolutePath: path.resolve(projectRoot, m.targetPath),
      }));
      backupFiles(projectRoot, filesToBackup);
    }

    // 7. Write to each enabled target
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

    // 8. Save snapshots of what was written (for future three-way comparison)
    saveSnapshots(projectRoot, sourceConfig.name, fileMappings);

    // 9. Update lockfile
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

  // Skip lockfile / gitignore updates for dry-run
  if (options.dryRun) return results;

  if (results.length > 0) {
    // Save lockfile
    saveLockfile(projectRoot, lockfile!);
    logger.success(`Lockfile updated.`);

    // Update .gitignore with output paths from enabled targets
    const ignorePaths = collectIgnorePaths(config.targets);
    if (updateGitignore(projectRoot, ignorePaths)) {
      logger.success(`Updated .gitignore with playbook-sync output paths.`);
    }
  }

  return results;
}

// ─── Pre-sync detection ───

/**
 * Build a list of all files that will be written during sync,
 * mapping source paths to target paths for each enabled target.
 */
function buildFileMappings(
  projectRoot: string,
  resolved: ResolvedSource,
  targets: Record<string, TargetConfig>
): TargetFileMapping[] {
  const mappings: TargetFileMapping[] = [];

  for (const [targetName, targetConfig] of Object.entries(targets)) {
    if (!targetConfig.enabled) continue;

    const skillsPath = targetConfig.skills_path;
    if (!skillsPath) continue;

    // Cursor uses .mdc format — skip file-level mapping (format is different)
    // Copilot merges all into a single file — skip individual file mapping
    const isTransformed = targetName === 'cursor' || targetConfig.mode === 'merge';
    if (isTransformed) continue;

    const basePath = path.dirname(skillsPath); // e.g. '.opencode'

    // Helper to add a mapping
    const addMapping = (sourceRelPath: string, targetRelPath: string, sourceAbsPath: string) => {
      mappings.push({
        targetRelPath,
        targetAbsPath: path.resolve(projectRoot, targetRelPath),
        sourceRelPath,
        sourceAbsPath,
        targetName,
      });
    };

    // Skills
    for (const skill of resolved.content.skills) {
      for (const sourceFile of skill.files) {
        const basename = path.basename(sourceFile);
        const targetRelPath = path.join(skillsPath, skill.name, basename).replace(/\\/g, '/');
        addMapping(sourceFile, targetRelPath, path.join(resolved.local_path, sourceFile));
      }
    }

    // skills/README.md
    if (resolved.content.skills_readme) {
      const targetRelPath = path.join(skillsPath, 'README.md').replace(/\\/g, '/');
      addMapping('skills/README.md', targetRelPath, resolved.content.skills_readme);
    }

    // AGENTS.md
    if (resolved.content.agents_md && targetConfig.agents_md) {
      addMapping('AGENTS.md', targetConfig.agents_md, resolved.content.agents_md);
    }

    // CLAUDE.md
    if (resolved.content.claude_md) {
      const targetRelPath = path.join(basePath, 'CLAUDE.md').replace(/\\/g, '/');
      addMapping('CLAUDE.md', targetRelPath, resolved.content.claude_md);
    }

    // README.md
    if (resolved.content.readme) {
      const targetRelPath = path.join(basePath, 'README.md').replace(/\\/g, '/');
      addMapping('README.md', targetRelPath, resolved.content.readme);
    }

    // Rules
    for (const rulePath of resolved.content.rules) {
      const targetRelPath = path.join(basePath, rulePath).replace(/\\/g, '/');
      addMapping(rulePath, targetRelPath, path.join(resolved.local_path, rulePath));
    }

    // Agents directory
    for (const agentPath of resolved.content.agents_dir) {
      const targetRelPath = path.join(basePath, agentPath).replace(/\\/g, '/');
      addMapping(agentPath, targetRelPath, path.join(resolved.local_path, agentPath));
    }

    // Docs
    for (const docPath of resolved.content.other_docs) {
      const targetRelPath = path.join(basePath, docPath).replace(/\\/g, '/');
      addMapping(docPath, targetRelPath, path.join(resolved.local_path, docPath));
    }

    // new_project_code
    for (const codePath of resolved.content.new_project_code) {
      const targetRelPath = path.join(basePath, codePath).replace(/\\/g, '/');
      addMapping(codePath, targetRelPath, path.join(resolved.local_path, codePath));
    }
  }

  return mappings;
}

/**
 * Detect modifications for all mapped files using three-way comparison:
 *   base (snapshot from last sync) vs local (current disk) vs remote (current source)
 * Falls back to lockfile checksum as base when no snapshot exists.
 */
function detectAllModifications(
  projectRoot: string,
  sourceName: string,
  mappings: TargetFileMapping[],
  lockfileChecksums: Map<string, string>
): FileModification[] {
  const results: FileModification[] = [];

  for (const mapping of mappings) {
    const snapshotChecksum = getSnapshotChecksum(
      projectRoot,
      sourceName,
      mapping.targetRelPath
    );

    // Fall back to lockfile checksum when no snapshot exists yet
    const baseChecksum = snapshotChecksum ?? lockfileChecksums.get(mapping.sourceRelPath) ?? null;

    const localChecksum = fs.existsSync(mapping.targetAbsPath)
      ? checksumFile(mapping.targetAbsPath)
      : null;

    const remoteChecksum = fs.existsSync(mapping.sourceAbsPath)
      ? checksumFile(mapping.sourceAbsPath)
      : null;

    if (!remoteChecksum) continue; // Source file doesn't exist, skip

    const type = detectModificationType(baseChecksum, localChecksum, remoteChecksum);

    results.push({
      targetPath: mapping.targetRelPath,
      sourcePath: mapping.sourceRelPath,
      type,
    });
  }

  return results;
}

// ─── Snapshot saving ───

/**
 * Save snapshots of target files after sync.
 * The snapshot stores a copy of the source file content, keyed by target path.
 */
function saveSnapshots(
  projectRoot: string,
  sourceName: string,
  mappings: TargetFileMapping[]
): void {
  for (const mapping of mappings) {
    if (fs.existsSync(mapping.sourceAbsPath)) {
      saveSnapshot(projectRoot, sourceName, mapping.targetRelPath, mapping.sourceAbsPath);
    }
  }
}

// ─── Reporting ───

function printDryRunReport(modifications: FileModification[]): void {
  const grouped = groupByType(modifications);

  console.log('');
  logger.info('Dry run — no changes will be applied:\n');

  if (grouped.modified_source.length > 0) {
    logger.step(`${grouped.modified_source.length} file(s) will be updated from source:`);
    for (const m of grouped.modified_source) {
      logger.dim(`    ${m.targetPath}`);
    }
  }

  if (grouped.modified_local.length > 0) {
    logger.warn(`${grouped.modified_local.length} file(s) modified locally (will block sync):`);
    for (const m of grouped.modified_local) {
      logger.dim(`    ${m.targetPath}`);
    }
  }

  if (grouped.conflict.length > 0) {
    logger.error(`${grouped.conflict.length} file(s) conflicting (both sides changed):`);
    for (const m of grouped.conflict) {
      logger.dim(`    ${m.targetPath}`);
    }
  }

  if (grouped.unmodified.length > 0) {
    logger.success(`${grouped.unmodified.length} file(s) already up-to-date.`);
  }

  if (grouped.modified_local.length > 0 || grouped.conflict.length > 0) {
    console.log('');
    logger.info('To force sync: pbs sync --force (local changes will be backed up automatically)');
    logger.info('To contribute first: pbs contribute');
  }
}

function printBlockedReport(
  localMods: FileModification[],
  conflicts: FileModification[]
): void {
  console.log('');
  logger.warn('Sync blocked — local modifications detected:\n');

  if (localMods.length > 0) {
    logger.step(`${localMods.length} file(s) modified locally:`);
    for (const m of localMods) {
      logger.dim(`    ${m.targetPath}`);
    }
  }

  if (conflicts.length > 0) {
    logger.error(`${conflicts.length} file(s) conflicting (both local and source changed):`);
    for (const m of conflicts) {
      logger.dim(`    ${m.targetPath}`);
    }
  }

  console.log('');
  logger.info('Options:');
  logger.dim('  pbs contribute             # Push local changes to source first');
  logger.dim('  pbs sync --force           # Force overwrite (auto-backup local changes)');
  logger.dim('  pbs sync --dry-run         # Preview what would happen');
  logger.dim('  pbs recover <backup-id>    # Restore from a backup after force sync');
}

function groupByType(modifications: FileModification[]): Record<ModificationType, FileModification[]> {
  return {
    unmodified: modifications.filter(m => m.type === 'unmodified'),
    modified_local: modifications.filter(m => m.type === 'modified_local'),
    modified_source: modifications.filter(m => m.type === 'modified_source'),
    conflict: modifications.filter(m => m.type === 'conflict'),
  };
}

// ─── Helpers ───

/**
 * Collect all file paths from a resolved source for lockfile tracking.
 */
function getAllSourceFiles(resolved: ResolvedSource): string[] {
  const files: string[] = [];

  // Skill files
  for (const skill of resolved.content.skills) {
    files.push(...skill.files);
  }

  // skills/README.md
  if (resolved.content.skills_readme) {
    files.push('skills/README.md');
  }

  // Rule files
  files.push(...resolved.content.rules);

  // Agents directory files
  files.push(...resolved.content.agents_dir);

  // Docs files
  files.push(...resolved.content.other_docs);

  // new_project_code files
  files.push(...resolved.content.new_project_code);

  // AGENTS.md
  if (resolved.content.agents_md) {
    files.push('AGENTS.md');
  }

  // CLAUDE.md
  if (resolved.content.claude_md) {
    files.push('CLAUDE.md');
  }

  // README.md
  if (resolved.content.readme) {
    files.push('README.md');
  }

  return files;
}
