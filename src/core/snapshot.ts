import * as fs from 'node:fs';
import * as path from 'node:path';
import { CACHE_DIR } from '../types.js';
import { checksumFile, checksumString } from '../utils/fs.js';

const SNAPSHOTS_DIR = 'snapshots';

/**
 * Get the snapshot directory for a given source.
 * Structure: .playbook-sync/snapshots/<source-name>/
 */
export function getSnapshotDir(projectRoot: string, sourceName: string): string {
  return path.join(projectRoot, CACHE_DIR, SNAPSHOTS_DIR, sourceName);
}

/**
 * Save a snapshot of a file — stores the content as it was at sync time.
 * This becomes the "base" for three-way comparison.
 */
export function saveSnapshot(
  projectRoot: string,
  sourceName: string,
  relativePath: string,
  absoluteSourcePath: string
): void {
  const snapshotPath = path.join(getSnapshotDir(projectRoot, sourceName), relativePath);
  const dir = path.dirname(snapshotPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(absoluteSourcePath, snapshotPath);
}

/**
 * Save a snapshot from string content (for transformed files like .mdc).
 */
export function saveSnapshotContent(
  projectRoot: string,
  sourceName: string,
  relativePath: string,
  content: string
): void {
  const snapshotPath = path.join(getSnapshotDir(projectRoot, sourceName), relativePath);
  const dir = path.dirname(snapshotPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(snapshotPath, content, 'utf-8');
}

/**
 * Read a snapshot file. Returns null if not found.
 */
export function readSnapshot(
  projectRoot: string,
  sourceName: string,
  relativePath: string
): string | null {
  const snapshotPath = path.join(getSnapshotDir(projectRoot, sourceName), relativePath);
  if (!fs.existsSync(snapshotPath)) return null;
  return fs.readFileSync(snapshotPath, 'utf-8');
}

/**
 * Get the checksum of a snapshot file. Returns null if not found.
 */
export function getSnapshotChecksum(
  projectRoot: string,
  sourceName: string,
  relativePath: string
): string | null {
  const snapshotPath = path.join(getSnapshotDir(projectRoot, sourceName), relativePath);
  if (!fs.existsSync(snapshotPath)) return null;
  return checksumFile(snapshotPath);
}

export type ModificationType = 'unmodified' | 'modified_local' | 'modified_source' | 'conflict';

export interface FileModification {
  /** Path relative to project root (target side, e.g. .claude/skills/xxx/SKILL.md) */
  targetPath: string;
  /** Path relative to source (e.g. skills/xxx/SKILL.md) */
  sourcePath: string;
  /** Type of modification */
  type: ModificationType;
}

/**
 * Detect modifications for a single target file using three-way comparison:
 *   base (snapshot) vs local (current file on disk) vs remote (source file)
 *
 * @param baseChecksum  SHA-256 of the snapshot (what was last synced)
 * @param localChecksum SHA-256 of the current file on disk (null = deleted)
 * @param remoteChecksum SHA-256 of the current source file
 */
export function detectModificationType(
  baseChecksum: string | null,
  localChecksum: string | null,
  remoteChecksum: string
): ModificationType {
  // No base snapshot — first sync or snapshot was cleared
  if (baseChecksum === null) {
    if (localChecksum === null) return 'modified_source';
    if (localChecksum === remoteChecksum) return 'unmodified';
    // We don't know the base, conservatively treat as source update
    return 'modified_source';
  }

  const localChanged = localChecksum !== baseChecksum;
  const remoteChanged = remoteChecksum !== baseChecksum;

  if (!localChanged && !remoteChanged) return 'unmodified';
  if (localChanged && !remoteChanged) return 'modified_local';
  if (!localChanged && remoteChanged) return 'modified_source';

  // Both changed — but maybe they converged to the same content
  if (localChecksum === remoteChecksum) return 'unmodified';

  return 'conflict';
}

/**
 * Remove the entire snapshot directory for a source.
 */
export function clearSnapshot(projectRoot: string, sourceName: string): void {
  const dir = getSnapshotDir(projectRoot, sourceName);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
