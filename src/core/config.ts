import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import {
  type PlaybookSyncConfig,
  type SourceConfig,
  type TargetConfig,
  CONFIG_FILENAME,
  DEFAULT_TARGETS,
} from '../types.js';

/**
 * Load config from playbook-sync.yaml in the given directory.
 */
export function loadConfig(projectRoot: string): PlaybookSyncConfig {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}\nRun "pbs init" to create one.`
    );
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const data = yaml.load(raw) as Record<string, unknown>;
  return validateConfig(data);
}

/**
 * Save config to playbook-sync.yaml.
 */
export function saveConfig(projectRoot: string, config: PlaybookSyncConfig): void {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  const content = yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  fs.writeFileSync(configPath, content, 'utf-8');
}

/**
 * Create a default config.
 */
export function createDefaultConfig(): PlaybookSyncConfig {
  return {
    version: 1,
    sources: [],
    targets: { ...DEFAULT_TARGETS },
  };
}

function validateConfig(data: Record<string, unknown>): PlaybookSyncConfig {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid config: expected an object');
  }

  const config: PlaybookSyncConfig = {
    version: (data.version as number) ?? 1,
    sources: [],
    targets: {},
  };

  // Validate sources
  if (Array.isArray(data.sources)) {
    for (const src of data.sources) {
      const s = src as Record<string, unknown>;
      if (!s.name || !s.type) {
        throw new Error('Each source must have "name" and "type" fields');
      }
      const source: SourceConfig = {
        name: s.name as string,
        type: s.type as SourceConfig['type'],
      };
      if (s.url) source.url = s.url as string;
      if (s.ref) source.ref = s.ref as string;
      if (s.path) source.path = s.path as string;
      if (Array.isArray(s.include)) source.include = s.include as string[];
      config.sources.push(source);
    }
  }

  // Validate targets
  if (data.targets && typeof data.targets === 'object') {
    const targets = data.targets as Record<string, Record<string, unknown>>;
    for (const [name, t] of Object.entries(targets)) {
      config.targets[name] = {
        enabled: t.enabled !== false,
        skills_path: t.skills_path as string | undefined,
        agents_md: t.agents_md as string | undefined,
        mode: t.mode as 'copy' | 'merge' | undefined,
        mdc_globs: t.mdc_globs as string[] | undefined,
        custom_path: t.custom_path as string | undefined,
      };
    }
  } else {
    config.targets = { ...DEFAULT_TARGETS };
  }

  return config;
}
