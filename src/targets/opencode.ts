import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ResolvedSource, type TargetConfig } from '../types.js';
import { type TargetFormatter, resolveTargetPath } from './base.js';
import { copyDirSync, ensureParentDir } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

/**
 * OpenCode target formatter.
 *
 * Structure:
 *   .opencode/skills/<skill-name>/SKILL.md
 *   AGENTS.md (root)
 */
export class OpenCodeFormatter implements TargetFormatter {
  readonly name = 'OpenCode';

  sync(projectRoot: string, source: ResolvedSource, config: TargetConfig): string[] {
    const written: string[] = [];
    const skillsPath = config.skills_path ?? '.opencode/skills';

    // Sync skills
    for (const skill of source.content.skills) {
      const srcDir = path.join(source.local_path, skill.relative_path);
      const dstDir = resolveTargetPath(projectRoot, path.join(skillsPath, skill.name));
      copyDirSync(srcDir, dstDir);

      for (const file of skill.files) {
        written.push(path.join(skillsPath, skill.name, path.basename(file)).replace(/\\/g, '/'));
      }
    }

    // Sync AGENTS.md
    if (source.content.agents_md && config.agents_md) {
      const dst = resolveTargetPath(projectRoot, config.agents_md);
      ensureParentDir(dst);
      fs.copyFileSync(source.content.agents_md, dst);
      written.push(config.agents_md);
    }

    logger.success(`  ${this.name}: ${written.length} files → ${skillsPath}`);
    return written;
  }
}
