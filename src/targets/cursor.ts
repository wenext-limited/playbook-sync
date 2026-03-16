import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ResolvedSource, type TargetConfig } from '../types.js';
import { type TargetFormatter, resolveTargetPath } from './base.js';
import { ensureParentDir } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

/**
 * Cursor target formatter.
 *
 * Converts SKILL.md files to .mdc format:
 *   .cursor/rules/<skill-name>.mdc
 *
 * MDC format includes frontmatter with description and globs.
 */
export class CursorFormatter implements TargetFormatter {
  readonly name = 'Cursor';

  sync(projectRoot: string, source: ResolvedSource, config: TargetConfig): string[] {
    const written: string[] = [];
    const rulesPath = config.skills_path ?? '.cursor/rules';
    const globs = config.mdc_globs ?? ['**/*.ts', '**/*.js'];

    // Convert each skill's SKILL.md to .mdc
    for (const skill of source.content.skills) {
      const skillContent = fs.readFileSync(skill.skill_md_path, 'utf-8');
      const description = extractDescription(skillContent, skill.name);
      const mdcContent = toMdc(description, globs, skillContent);

      const dstPath = resolveTargetPath(
        projectRoot,
        path.join(rulesPath, `${skill.name}.mdc`)
      );
      ensureParentDir(dstPath);
      fs.writeFileSync(dstPath, mdcContent, 'utf-8');

      written.push(path.join(rulesPath, `${skill.name}.mdc`).replace(/\\/g, '/'));
    }

    // Also convert rules/ files
    for (const rulePath of source.content.rules) {
      const srcPath = path.join(source.local_path, rulePath);
      const ruleContent = fs.readFileSync(srcPath, 'utf-8');
      const ruleName = path.basename(rulePath, path.extname(rulePath));
      const description = extractDescription(ruleContent, ruleName);
      const mdcContent = toMdc(description, globs, ruleContent);

      const dstPath = resolveTargetPath(
        projectRoot,
        path.join(rulesPath, `rule-${ruleName}.mdc`)
      );
      ensureParentDir(dstPath);
      fs.writeFileSync(dstPath, mdcContent, 'utf-8');

      written.push(path.join(rulesPath, `rule-${ruleName}.mdc`).replace(/\\/g, '/'));
    }

    logger.success(`  ${this.name}: ${written.length} .mdc files → ${rulesPath}`);
    return written;
  }
}

/**
 * Extract a short description from the first heading or frontmatter.
 */
function extractDescription(content: string, fallback: string): string {
  // Try frontmatter description
  const fmMatch = content.match(/^---\s*\n[\s\S]*?description:\s*(.+)\n[\s\S]*?---/);
  if (fmMatch) return fmMatch[1].trim();

  // Try first heading
  const headingMatch = content.match(/^#\s+(.+)/m);
  if (headingMatch) return headingMatch[1].trim();

  return fallback;
}

/**
 * Wrap content in Cursor MDC format.
 */
function toMdc(description: string, globs: string[], content: string): string {
  const globsStr = globs.map(g => `"${g}"`).join(', ');

  return `---
description: ${description}
globs: [${globsStr}]
alwaysApply: false
---

${content}`;
}
