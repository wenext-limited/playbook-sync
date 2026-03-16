import { type TargetFormatter } from './base.js';
import { OpenCodeFormatter } from './opencode.js';
import { CursorFormatter } from './cursor.js';
import { CopilotFormatter } from './copilot.js';
import { ClaudeFormatter } from './claude.js';

/**
 * Registry of all supported target formatters.
 */
export const FORMATTERS: Record<string, TargetFormatter> = {
  opencode: new OpenCodeFormatter(),
  cursor: new CursorFormatter(),
  copilot: new CopilotFormatter(),
  claude: new ClaudeFormatter(),
};

/**
 * Get a target formatter by name.
 */
export function getFormatter(name: string): TargetFormatter | undefined {
  return FORMATTERS[name];
}

export { type TargetFormatter } from './base.js';
export { OpenCodeFormatter } from './opencode.js';
export { CursorFormatter } from './cursor.js';
export { CopilotFormatter } from './copilot.js';
export { ClaudeFormatter } from './claude.js';
