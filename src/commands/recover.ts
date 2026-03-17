import chalk from 'chalk';
import { listBackups, listBackupFiles, recoverFromBackup } from '../core/backup.js';
import { findProjectRoot } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

/**
 * List available backups or recover from a specific one.
 *
 * Usage:
 *   pbs recover              # List all backups
 *   pbs recover <backup-id>  # Restore files from a backup
 */
export async function recoverCommand(backupId?: string): Promise<void> {
  const projectRoot = findProjectRoot();

  if (!backupId) {
    // List mode
    const backups = listBackups(projectRoot);
    if (backups.length === 0) {
      logger.info('No backups found.');
      return;
    }

    logger.info(`Found ${backups.length} backup(s):\n`);
    for (const backup of backups) {
      const files = listBackupFiles(backup.path);
      const time = backup.createdAt.toLocaleString();
      console.log(`  ${chalk.cyan(backup.id)}  ${chalk.dim(time)}  (${files.length} files)`);
      for (const f of files.slice(0, 5)) {
        console.log(`    ${chalk.dim(f)}`);
      }
      if (files.length > 5) {
        console.log(`    ${chalk.dim(`... and ${files.length - 5} more`)}`);
      }
      console.log('');
    }

    logger.info('To restore: pbs recover <backup-id>');
    return;
  }

  // Recover mode
  try {
    const restored = recoverFromBackup(projectRoot, backupId);
    logger.success(`Restored ${restored} file(s) from backup "${backupId}".`);
    logger.info('Run "pbs status" to verify, or "pbs sync --force" to re-sync from source.');
  } catch (err) {
    logger.error(String(err));
  }
}
