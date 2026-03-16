import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { type Lockfile, type LockedSource, type LockedFile, LOCKFILE_FILENAME } from '../types.js';
import { checksumFile } from '../utils/fs.js';

/**
 * Load lockfile from disk. Returns null if not found.
 */
export function loadLockfile(projectRoot: string): Lockfile | null {
  const lockPath = path.join(projectRoot, LOCKFILE_FILENAME);
  if (!fs.existsSync(lockPath)) return null;

  const raw = fs.readFileSync(lockPath, 'utf-8');
  return yaml.load(raw) as Lockfile;
}

/**
 * Save lockfile to disk.
 */
export function saveLockfile(projectRoot: string, lockfile: Lockfile): void {
  const lockPath = path.join(projectRoot, LOCKFILE_FILENAME);
  const content = yaml.dump(lockfile, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  fs.writeFileSync(lockPath, content, 'utf-8');
}

/**
 * Create a new lockfile entry for a resolved source.
 */
export function createLockedSource(
  type: LockedSource['type'],
  resolvedRef: string,
  localPath: string,
  files: string[],
  url?: string,
  sourcePath?: string
): LockedSource {
  const lockedFiles: LockedFile[] = files.map(f => ({
    path: f,
    checksum: checksumFile(path.join(localPath, f)),
  }));

  return {
    type,
    url,
    path: sourcePath,
    resolved_ref: resolvedRef,
    synced_at: new Date().toISOString(),
    files: lockedFiles,
  };
}

/**
 * Create/update lockfile with new source data.
 */
export function updateLockfile(
  existing: Lockfile | null,
  sourceName: string,
  lockedSource: LockedSource
): Lockfile {
  const lockfile: Lockfile = existing ?? {
    version: 1,
    locked_at: '',
    sources: {},
  };

  lockfile.locked_at = new Date().toISOString();
  lockfile.sources[sourceName] = lockedSource;

  return lockfile;
}

/**
 * Check if a target file has been modified compared to the lockfile checksum.
 */
export function isFileModified(
  lockfile: Lockfile,
  sourceName: string,
  filePath: string,
  absolutePath: string
): boolean {
  const source = lockfile.sources[sourceName];
  if (!source) return true;

  const lockedFile = source.files.find(f => f.path === filePath);
  if (!lockedFile) return true;

  if (!fs.existsSync(absolutePath)) return true;

  const currentChecksum = checksumFile(absolutePath);
  return currentChecksum !== lockedFile.checksum;
}
