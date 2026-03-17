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
 *   .opencode/skills/README.md
 *   .opencode/rules/...
 *   .opencode/agents/...
 *   .opencode/docs/...
 *   .opencode/new_project_code/...
 *   .opencode/CLAUDE.md
 *   .opencode/README.md
 *   AGENTS.md (root)
 */
export class OpenCodeFormatter implements TargetFormatter {
  readonly name = 'OpenCode';

  sync(projectRoot: string, source: ResolvedSource, config: TargetConfig): string[] {
    const written: string[] = [];
    const skillsPath = config.skills_path ?? '.opencode/skills';
    const basePath = path.dirname(skillsPath); // e.g. '.opencode'

    // Sync skills
    for (const skill of source.content.skills) {
      const srcDir = path.join(source.local_path, skill.relative_path);
      const dstDir = resolveTargetPath(projectRoot, path.join(skillsPath, skill.name));
      copyDirSync(srcDir, dstDir);

      for (const file of skill.files) {
        written.push(path.join(skillsPath, skill.name, path.basename(file)).replace(/\\/g, '/'));
      }
    }

    // Sync skills/README.md (root-level index)
    if (source.content.skills_readme) {
      const dst = resolveTargetPath(projectRoot, path.join(skillsPath, 'README.md'));
      ensureParentDir(dst);
      fs.copyFileSync(source.content.skills_readme, dst);
      written.push(path.join(skillsPath, 'README.md').replace(/\\/g, '/'));
    }

    // Sync AGENTS.md (to project root)
    if (source.content.agents_md && config.agents_md) {
      const dst = resolveTargetPath(projectRoot, config.agents_md);
      ensureParentDir(dst);
      fs.copyFileSync(source.content.agents_md, dst);
      written.push(config.agents_md);
    }

    // Sync CLAUDE.md (to base path)
    if (source.content.claude_md) {
      const dst = resolveTargetPath(projectRoot, path.join(basePath, 'CLAUDE.md'));
      ensureParentDir(dst);
      fs.copyFileSync(source.content.claude_md, dst);
      written.push(path.join(basePath, 'CLAUDE.md').replace(/\\/g, '/'));
    }

    // Sync README.md (to base path)
    if (source.content.readme) {
      const dst = resolveTargetPath(projectRoot, path.join(basePath, 'README.md'));
      ensureParentDir(dst);
      fs.copyFileSync(source.content.readme, dst);
      written.push(path.join(basePath, 'README.md').replace(/\\/g, '/'));
    }

    // Sync rules/ directory
    for (const rulePath of source.content.rules) {
      const srcPath = path.join(source.local_path, rulePath);
      const dstPath = resolveTargetPath(projectRoot, path.join(basePath, rulePath));
      ensureParentDir(dstPath);
      fs.copyFileSync(srcPath, dstPath);
      written.push(path.join(basePath, rulePath).replace(/\\/g, '/'));
    }

    // Sync agents/ directory
    for (const agentPath of source.content.agents_dir) {
      const srcPath = path.join(source.local_path, agentPath);
      const dstPath = resolveTargetPath(projectRoot, path.join(basePath, agentPath));
      ensureParentDir(dstPath);
      fs.copyFileSync(srcPath, dstPath);
      written.push(path.join(basePath, agentPath).replace(/\\/g, '/'));
    }

    // Sync docs/ directory
    for (const docPath of source.content.other_docs) {
      const srcPath = path.join(source.local_path, docPath);
      const dstPath = resolveTargetPath(projectRoot, path.join(basePath, docPath));
      ensureParentDir(dstPath);
      fs.copyFileSync(srcPath, dstPath);
      written.push(path.join(basePath, docPath).replace(/\\/g, '/'));
    }

    // Sync new_project_code/ directory
    for (const codePath of source.content.new_project_code) {
      const srcPath = path.join(source.local_path, codePath);
      const dstPath = resolveTargetPath(projectRoot, path.join(basePath, codePath));
      ensureParentDir(dstPath);
      fs.copyFileSync(srcPath, dstPath);
      written.push(path.join(basePath, codePath).replace(/\\/g, '/'));
    }

    logger.success(`  ${this.name}: ${written.length} files → ${basePath}/`);
    return written;
  }
}
