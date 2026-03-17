import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { addCommand, type AddOptions } from './commands/add.js';
import { syncCommand, type SyncOptions } from './commands/sync.js';
import { statusCommand } from './commands/status.js';
import { contributeCommand, type ContributeOptions } from './commands/contribute.js';
import { watchCommand } from './commands/watch.js';
import { recoverCommand } from './commands/recover.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('pbs')
  .description(
    'Playbook Sync — Sync AI agent playbooks across projects with bidirectional contribution'
  )
  .version('0.1.0');

// ─── init ───
program
  .command('init')
  .description('Initialize playbook-sync in the current project')
  .action(async () => {
    try {
      await initCommand();
    } catch (err) {
      logger.error(String(err));
      process.exit(1);
    }
  });

// ─── add ───
program
  .command('add <source>')
  .description('Add a playbook source (git URL, local path, or submodule)')
  .option('-n, --name <name>', 'Custom source name')
  .option('-r, --ref <ref>', 'Git branch, tag, or commit (default: main)')
  .option('-l, --local', 'Treat source as a local path')
  .option('-s, --submodule', 'Treat source as a git submodule')
  .option('-i, --include <patterns...>', 'Include only matching skill patterns')
  .action(async (source: string, options: AddOptions) => {
    try {
      await addCommand(source, options);
    } catch (err) {
      logger.error(String(err));
      process.exit(1);
    }
  });

// ─── sync ───
program
  .command('sync')
  .description('Sync all playbook sources to AI tool directories')
  .option('-d, --dry-run', 'Preview what would happen without writing')
  .option('-f, --force', 'Force overwrite local changes (auto-backup first)')
  .action(async (options: SyncOptions) => {
    try {
      await syncCommand(options);
    } catch (err) {
      logger.error(String(err));
      process.exit(1);
    }
  });

// ─── status ───
program
  .command('status')
  .description('Show sync status and detect local modifications')
  .action(async () => {
    try {
      await statusCommand();
    } catch (err) {
      logger.error(String(err));
      process.exit(1);
    }
  });

// ─── contribute ───
program
  .command('contribute')
  .description('Push local modifications back to the playbook source')
  .option('-s, --source <name>', 'Source name to contribute to')
  .option('-b, --branch <name>', 'Branch name for contribution')
  .option('-m, --message <msg>', 'Commit message')
  .option('--no-push', 'Skip auto-push (git sources push by default)')
  .option('-d, --dry-run', 'Show what would be contributed without applying')
  .action(async (options: ContributeOptions) => {
    try {
      await contributeCommand(options);
    } catch (err) {
      logger.error(String(err));
      process.exit(1);
    }
  });

// ─── recover ───
program
  .command('recover [backup-id]')
  .description('List backups or recover files from a specific backup')
  .action(async (backupId?: string) => {
    try {
      await recoverCommand(backupId);
    } catch (err) {
      logger.error(String(err));
      process.exit(1);
    }
  });

// ─── watch ───
program
  .command('watch')
  .description('Watch source directories and auto-sync on changes')
  .action(async () => {
    try {
      await watchCommand();
    } catch (err) {
      logger.error(String(err));
      process.exit(1);
    }
  });

program.parse();
