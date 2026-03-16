import * as path from 'node:path';
import { type ResolvedSource, type TargetConfig } from '../types.js';

/**
 * Base interface for target formatters.
 * Each formatter knows how to write playbook content
 * in the format expected by a specific AI tool.
 */
export interface TargetFormatter {
  /** Human-readable target name */
  readonly name: string;

  /**
   * Sync content from resolved source to the target directory.
   * Returns a list of written file paths (relative to project root).
   */
  sync(
    projectRoot: string,
    source: ResolvedSource,
    config: TargetConfig
  ): string[];
}

/**
 * Resolve a target path relative to the project root.
 */
export function resolveTargetPath(projectRoot: string, targetPath: string): string {
  return path.resolve(projectRoot, targetPath);
}
