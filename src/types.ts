// ─── Source Configuration ───

export type SourceType = 'git' | 'submodule' | 'local';

export interface SourceConfig {
  name: string;
  type: SourceType;
  /** Git repository URL (for type: git) */
  url?: string;
  /** Branch, tag, or commit (for type: git) */
  ref?: string;
  /** Local path (for type: local or submodule) */
  path?: string;
  /** Subdirectories to include (default: all) */
  include?: string[];
}

// ─── Target Configuration ───

export type TargetType = 'opencode' | 'cursor' | 'copilot' | 'claude' | 'windsurf' | 'custom';

export interface TargetConfig {
  enabled: boolean;
  /** Path for skills/rules output */
  skills_path?: string;
  /** Path for AGENTS.md output */
  agents_md?: string;
  /** For copilot: merge all into single file */
  mode?: 'copy' | 'merge';
  /** For cursor: .mdc format options */
  mdc_globs?: string[];
  /** For custom targets */
  custom_path?: string;
}

// ─── Main Config (playbook-sync.yaml) ───

export interface PlaybookSyncConfig {
  version: number;
  sources: SourceConfig[];
  targets: Record<string, TargetConfig>;
}

// ─── Lockfile ───

export interface LockedFile {
  path: string;
  checksum: string;
}

export interface LockedSource {
  type: SourceType;
  url?: string;
  path?: string;
  resolved_ref: string;
  synced_at: string;
  files: LockedFile[];
}

export interface Lockfile {
  version: number;
  locked_at: string;
  sources: Record<string, LockedSource>;
}

// ─── Discovery ───

export interface DiscoveredSkill {
  /** Skill name (directory name) */
  name: string;
  /** Relative path within source (e.g., "skills/cocos-ui-system") */
  relative_path: string;
  /** Absolute path to SKILL.md */
  skill_md_path: string;
  /** All files in the skill directory */
  files: string[];
}

export interface DiscoveredContent {
  skills: DiscoveredSkill[];
  /** Paths to rule files */
  rules: string[];
  /** Path to AGENTS.md if found */
  agents_md?: string;
  /** Path to README.md if found */
  readme?: string;
  /** All other markdown files */
  other_docs: string[];
}

// ─── Resolved Source ───

export interface ResolvedSource {
  config: SourceConfig;
  /** Absolute local path to source content */
  local_path: string;
  /** Resolved git ref (commit hash) */
  resolved_ref: string;
  /** Discovered content in this source */
  content: DiscoveredContent;
}

// ─── Sync Status ───

export type FileStatus = 'synced' | 'modified_local' | 'modified_source' | 'conflict' | 'new' | 'deleted';

export interface SyncFileStatus {
  path: string;
  source_path: string;
  target_path: string;
  status: FileStatus;
}

export interface SyncStatus {
  source_name: string;
  source_ref: string;
  files: SyncFileStatus[];
  has_local_changes: boolean;
  has_source_changes: boolean;
}

// ─── Constants ───

export const CONFIG_FILENAME = 'playbook-sync.yaml';
export const LOCKFILE_FILENAME = 'playbook-sync.lock.yaml';
export const CACHE_DIR = '.playbook-sync';
export const DEFAULT_TARGETS: Record<string, TargetConfig> = {
  opencode: {
    enabled: true,
    skills_path: '.opencode/skills',
    agents_md: 'AGENTS.md',
  },
  cursor: {
    enabled: true,
    skills_path: '.cursor/rules',
    mdc_globs: ['**/*.ts', '**/*.js'],
  },
  copilot: {
    enabled: false,
    skills_path: '.github/copilot-instructions.md',
    mode: 'merge',
  },
  claude: {
    enabled: false,
    skills_path: '.claude/skills',
    agents_md: 'AGENTS.md',
  },
};
