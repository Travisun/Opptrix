/** Agent Skills 开放标准（agentskills.io）— 技能元数据与注册条目 */

export type AgentSkillSource = 'builtin' | 'user' | 'imported' | 'agent_created'

export interface AgentSkillFrontmatter {
  name: string
  description: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  /** Experimental: space-separated tool allowlist */
  allowedTools?: string
}

export interface AgentSkillIndexEntry {
  name: string
  description: string
  source: AgentSkillSource
  /** Absolute path to skill root directory */
  rootDir: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string
}

export interface AgentSkillDetail extends AgentSkillIndexEntry {
  /** Markdown body after frontmatter (instructions) */
  body: string
  /** Full SKILL.md text */
  raw: string
}

export interface CreateSkillInput {
  name: string
  description: string
  body: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string
  source?: Extract<AgentSkillSource, 'user' | 'imported' | 'agent_created'>
}

export interface ParseSkillResult {
  frontmatter: AgentSkillFrontmatter
  body: string
  raw: string
}

export class AgentSkillError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'invalid_name'
      | 'invalid_description'
      | 'invalid_frontmatter'
      | 'not_found'
      | 'builtin_readonly'
      | 'path_escape'
      | 'exists'
      | 'injection'
      | 'too_large',
  ) {
    super(message)
    this.name = 'AgentSkillError'
  }
}
