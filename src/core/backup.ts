import * as fs from 'node:fs';
import * as path from 'node:path';
import { CACHE_DIR } from '../types.js';
import { logger } from '../utils/logger.js';

const BACKUPS_DIR = 'backups';
const MAX_BACKUPS = 10;

export interface BackupEntry {
  /** Backup ID (timestamp string, e.g. "20260317-143022") */
  id: string;
  /** Absolute path to the backup directory */
  path: string;
  /** Timestamp */
  createdAt: Date;
}

/**
 * Get the backups root directory.
 */
function getBackupsRoot(projectRoot: string): string {
  return path.join(projectRoot, CACHE_DIR, BACKUPS_DIR);
}

/**
 * Create a timestamped backup ID.
 */
function createBackupId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

/**
 * Backup a list of local files before they are overwritten.
 *
 * @param projectRoot  Project root directory
 * @param files        Array of { relativePath, absolutePath } to back up
 * @returns The backup ID, or null if nothing was backed up
 */
export function backupFiles(
  projectRoot: string,
  files: Array<{ relativePath: string; absolutePath: string }>
): string | null {
  const toBackup = files.filter(f => fs.existsSync(f.absolutePath));
  if (toBackup.length === 0) return null;

  const backupId = createBackupId();
  const backupDir = path.join(getBackupsRoot(projectRoot), backupId);

  for (const file of toBackup) {
    const dst = path.join(backupDir, file.relativePath);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(file.absolutePath, dst);
  }

  logger.success(`Backed up ${toBackup.length} file(s) → .playbook-sync/backups/${backupId}`);

  // Prune old backups
  pruneOldBackups(projectRoot);

  return backupId;
}

/**
 * List all available backups, sorted newest first.
 */
export function listBackups(projectRoot: string): BackupEntry[] {
  const root = getBackupsRoot(projectRoot);
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const backups: BackupEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const backupPath = path.join(root, entry.name);
    const stat = fs.statSync(backupPath);
    backups.push({
      id: entry.name,
      path: backupPath,
      createdAt: stat.mtime,
    });
  }

  // Sort newest first
  backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return backups;
}

/**
 * List files inside a specific backup.
 */
export function listBackupFiles(backupPath: string, base?: string): string[] {
  const result: string[] = [];
  const baseDir = base ?? backupPath;
  if (!fs.existsSync(backupPath)) return result;

  const entries = fs.readdirSync(backupPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(backupPath, entry.name);
    if (entry.isDirectory()) {
      result.push(...listBackupFiles(fullPath, baseDir));
    } else {
      result.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return result;
}

/**
 * Recover files from a backup, restoring them to their original locations.
 *
 * @param projectRoot  Project root directory
 * @param backupId     The backup ID to recover from
 * @returns Number of files restored
 */
export function recoverFromBackup(projectRoot: string, backupId: string): number {
  const backupDir = path.join(getBackupsRoot(projectRoot), backupId);
  if (!fs.existsSync(backupDir)) {
    throw new Error(`Backup "${backupId}" not found.`);
  }

  const files = listBackupFiles(backupDir);
  let restored = 0;

  for (const relPath of files) {
    const src = path.join(backupDir, relPath);
    const dst = path.join(projectRoot, relPath);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    restored++;
  }

  return restored;
}

/**
 * Keep only the most recent MAX_BACKUPS backups.
 */
function pruneOldBackups(projectRoot: string): void {
  const backups = listBackups(projectRoot);
  if (backups.length <= MAX_BACKUPS) return;

  const toRemove = backups.slice(MAX_BACKUPS);
  for (const backup of toRemove) {
    fs.rmSync(backup.path, { recursive: true, force: true });
  }
}
