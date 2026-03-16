import * as fs from 'node:fs';
import * as path from 'node:path';
import { type DiscoveredContent, type DiscoveredSkill } from '../types.js';
import { listFilesSync } from '../utils/fs.js';

/**
 * Discover all playbook content in a source directory.
 * Scans for:
 *  - skills/  directories containing SKILL.md
 *  - rules/   directories
 *  - AGENTS.md at root
 *  - README.md at root
 */
export function discoverContent(
  sourceRoot: string,
  includePatterns?: string[]
): DiscoveredContent {
  const result: DiscoveredContent = {
    skills: [],
    rules: [],
    other_docs: [],
  };

  // Discover AGENTS.md
  const agentsMd = path.join(sourceRoot, 'AGENTS.md');
  if (fs.existsSync(agentsMd)) {
    result.agents_md = agentsMd;
  }

  // Discover README.md
  const readmeMd = path.join(sourceRoot, 'README.md');
  if (fs.existsSync(readmeMd)) {
    result.readme = readmeMd;
  }

  // Discover skills — look for directories containing SKILL.md
  const skillsDir = path.join(sourceRoot, 'skills');
  if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Apply include filter if specified
      if (includePatterns && includePatterns.length > 0) {
        const matchesInclude = includePatterns.some(p =>
          `skills/${entry.name}`.includes(p) || entry.name.includes(p)
        );
        if (!matchesInclude) continue;
      }

      const skillDir = path.join(skillsDir, entry.name);
      const skillMd = path.join(skillDir, 'SKILL.md');

      if (fs.existsSync(skillMd)) {
        const files = listFilesSync(skillDir).map(f => `skills/${entry.name}/${f}`);
        const skill: DiscoveredSkill = {
          name: entry.name,
          relative_path: `skills/${entry.name}`,
          skill_md_path: skillMd,
          files,
        };
        result.skills.push(skill);
      }
    }
  }

  // Discover rules
  const rulesDir = path.join(sourceRoot, 'rules');
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    result.rules = listFilesSync(rulesDir).map(f => `rules/${f}`);
  }

  // Discover other docs
  const docsDir = path.join(sourceRoot, 'docs');
  if (fs.existsSync(docsDir) && fs.statSync(docsDir).isDirectory()) {
    result.other_docs = listFilesSync(docsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => `docs/${f}`);
  }

  return result;
}
