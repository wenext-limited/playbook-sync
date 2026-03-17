import { simpleGit, type SimpleGit } from 'simple-git';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CACHE_DIR } from '../types.js';
import { logger } from './logger.js';

/**
 * Clone or fetch a git repo into the cache directory.
 * Returns the absolute path to the cached repo.
 */
export async function ensureGitRepo(
  projectRoot: string,
  url: string,
  ref: string = 'main'
): Promise<{ repoPath: string; resolvedRef: string }> {
  const cacheDir = path.join(projectRoot, CACHE_DIR, 'repos');
  fs.mkdirSync(cacheDir, { recursive: true });

  // Use URL hash as cache key
  const repoHash = url.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  const repoPath = path.join(cacheDir, repoHash);

  const git: SimpleGit = simpleGit();

  if (fs.existsSync(path.join(repoPath, '.git'))) {
    // Fetch latest
    logger.step(`Fetching updates from ${url}...`);
    const repoGit = simpleGit(repoPath);
    await repoGit.fetch('origin');
    await repoGit.checkout(ref).catch(async () => {
      // ref might be a remote branch
      await repoGit.checkout(['-B', ref, `origin/${ref}`]);
    });
    await repoGit.pull('origin', ref).catch(() => {
      // May fail if detached HEAD — that's ok
    });
    const log = await repoGit.log({ maxCount: 1 });
    return { repoPath, resolvedRef: log.latest?.hash ?? 'unknown' };
  } else {
    // Clone
    logger.step(`Cloning ${url}...`);
    await git.clone(url, repoPath, ['--branch', ref, '--single-branch']);
    const repoGit = simpleGit(repoPath);
    const log = await repoGit.log({ maxCount: 1 });
    return { repoPath, resolvedRef: log.latest?.hash ?? 'unknown' };
  }
}

/**
 * Get the current commit hash for a git repo (submodule or local).
 */
export async function getRepoHead(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  const log = await git.log({ maxCount: 1 });
  return log.latest?.hash ?? 'unknown';
}

/**
 * Check if a path is inside a git submodule.
 */
export async function isSubmodule(projectRoot: string, subPath: string): Promise<boolean> {
  const gitmodulesPath = path.join(projectRoot, '.gitmodules');
  if (!fs.existsSync(gitmodulesPath)) return false;
  const content = fs.readFileSync(gitmodulesPath, 'utf-8');
  return content.includes(subPath);
}

/**
 * Fetch from origin and rebase the current branch onto the remote tracking branch.
 * If there are rebase conflicts, the rebase is aborted and an error is thrown
 * with instructions for the user to resolve manually.
 */
export async function fetchAndRebase(
  repoPath: string,
  branch: string
): Promise<void> {
  const git = simpleGit(repoPath);

  logger.step(`Fetching latest from origin...`);
  await git.fetch('origin');

  // Check if the remote branch exists
  const remoteRefs = await git.branch(['-r']);
  const remoteBranch = `origin/${branch}`;
  if (!remoteRefs.all.includes(remoteBranch)) {
    // Remote branch doesn't exist yet — nothing to rebase onto
    logger.dim(`  Remote branch ${remoteBranch} does not exist yet; skipping rebase.`);
    return;
  }

  logger.step(`Rebasing ${branch} onto ${remoteBranch}...`);
  try {
    await git.rebase([remoteBranch]);
  } catch (err) {
    // Rebase failed — likely a conflict. Abort and inform the user.
    logger.warn('Rebase failed due to conflicts. Aborting rebase...');
    try {
      await git.rebase(['--abort']);
    } catch {
      // Abort may fail if rebase wasn't in progress — ignore
    }

    const msg = [
      'Could not automatically rebase your changes onto the latest remote.',
      'The remote branch has diverged from your local changes.',
      '',
      'To resolve manually:',
      `  cd ${repoPath}`,
      `  git fetch origin`,
      `  git rebase origin/${branch}`,
      '  # Fix conflicts, then: git rebase --continue',
      `  git push origin ${branch}`,
    ].join('\n');

    throw new Error(msg);
  }

  logger.success('Rebase successful — local branch is up to date.');
}

/**
 * Create a branch, commit changes, and push to remote.
 * When push is true, automatically fetches and rebases before pushing
 * to handle upstream changes gracefully.
 */
export async function commitAndPush(
  repoPath: string,
  branch: string,
  message: string,
  files: string[]
): Promise<void> {
  const git = simpleGit(repoPath);
  const currentBranch = (await git.branch()).current;

  if (currentBranch !== branch) {
    await git.checkoutLocalBranch(branch).catch(async () => {
      await git.checkout(branch);
    });
  }

  await git.add(files);

  // Check if there's anything to commit (files may already be staged)
  const status = await git.status();
  if (status.staged.length === 0 && status.files.length === 0) {
    logger.info('No changes to commit.');
    return;
  }

  await git.commit(message);

  // Fetch + rebase before push to avoid non-fast-forward rejections
  await fetchAndRebase(repoPath, branch);

  logger.step(`Pushing to origin/${branch}...`);
  await git.push('origin', branch, ['--set-upstream']);
}
