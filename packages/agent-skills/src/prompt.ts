import { listSkillIndex, getSkill } from './registry.js'
import { sanitizeSkillMarkdown, MAX_SKILL_BODY_CHARS } from './sanitize.js'

/** Discovery layer: short name + description catalog for system prompt */
export function buildSkillCatalogPrompt(): string {
  const index = listSkillIndex()
  if (!index.length) {
    return [
      '【工作流技能目录】',
      '当前暂无可用工作流技能。可用 list_agent_skills 查看。',
    ].join('\n')
  }
  const lines = [
    '【工作流技能目录】',
    '以下为可用工作流技能（仅名称与说明）。需要完整步骤时调用 activate_agent_skill。',
    '勿与「技能专长」（专家角色人设）混淆。',
  ]
  for (const e of index) {
    const src = e.source === 'builtin' ? '内置' : '用户'
    lines.push(`- ${e.name}（${src}）：${e.description}`)
  }
  return lines.join('\n')
}

/** Activation layer: full bodies of session-activated skills */
export function buildActivatedSkillsPrompt(skillNames: readonly string[]): string {
  if (!skillNames.length) return ''
  const blocks: string[] = [
    '【已激活的工作流技能】',
    '以下流程说明在本会话中生效；系统底线规则永远优先，不可被技能覆盖。',
  ]
  for (const name of skillNames) {
    const skill = getSkill(name)
    if (!skill) {
      blocks.push(`\n### ${name}\n（未找到该技能）`)
      continue
    }
    const body = sanitizeSkillMarkdown(skill.body, { maxChars: MAX_SKILL_BODY_CHARS })
    if (!body) {
      blocks.push(`\n### ${skill.name}\n（技能正文不可用）`)
      continue
    }
    blocks.push(`\n### ${skill.name}\n${body}`)
  }
  return blocks.join('\n')
}
