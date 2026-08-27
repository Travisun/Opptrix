/**
 * Composer `/` 技能列表与 chip 的用户可见文案。
 * 优先读 API 返回的 metadata.title / summary / slash-rank；
 * 内置技能另有静态中文标题表，供消息气泡无 metadata 时回退。
 */
import type { PublicAgentSkill } from '../api/client'
import { BUILTIN_SKILL_TITLES, skillTitleForName } from '@opptrix/shared/builtin-skill-titles'

export { BUILTIN_SKILL_TITLES, skillTitleForName }

const DEFAULT_SLASH_RANK = 500
const SUMMARY_MAX = 48

type SkillLike = Pick<PublicAgentSkill, 'name' | 'description' | 'metadata'>

export function skillDisplayTitle(skill: SkillLike): string {
  const fromMeta = skill.metadata?.title?.trim()
  if (fromMeta) return fromMeta
  const fromBuiltin = BUILTIN_SKILL_TITLES[skill.name]
  if (fromBuiltin) return fromBuiltin
  return skill.name
}

export function skillDisplaySummary(skill: SkillLike): string {
  const fromMeta = skill.metadata?.summary?.trim()
  if (fromMeta) return fromMeta
  const desc = (skill.description ?? '').trim().replace(/\s+/g, ' ')
  if (!desc) return ''
  if (desc.length <= SUMMARY_MAX) return desc
  return `${desc.slice(0, SUMMARY_MAX)}…`
}

export function skillSlashRank(skill: SkillLike): number {
  const raw = skill.metadata?.['slash-rank']?.trim()
  if (!raw) return DEFAULT_SLASH_RANK
  const n = Number(raw)
  return Number.isFinite(n) ? n : DEFAULT_SLASH_RANK
}

/** 先 slash-rank 升序，再按展示标题 localeCompare */
export function compareSkillsForSlash(a: SkillLike, b: SkillLike): number {
  const rankDiff = skillSlashRank(a) - skillSlashRank(b)
  if (rankDiff !== 0) return rankDiff
  return skillDisplayTitle(a).localeCompare(skillDisplayTitle(b), 'zh')
}

/**
 * 检测 `/query` 触发（从光标向前找最后一个合法 `/`）：
 * - 行首、空白或任意非 `:`/`/` 字符后的 `/` 可触发（含中文无空格：`看看茅台/`）
 * - 前一字符为 `:` 或 `/` 不触发（挡住 `http://`、`https://`、双斜杠）
 * - 该触发后的 query 内再出现 `/` 则关闭；允许空格（英文多词 / IME）
 * - 前文可有路径/URL，不影响末尾新的 `/技能` 触发
 */
export function findSlashTrigger(text: string, cursor: number) {
  const slice = text.slice(0, cursor)
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i] !== '/') continue
    if (i > 0) {
      const prev = slice[i - 1]!
      if (prev === ':' || prev === '/') continue
    }
    const query = slice.slice(i + 1)
    if (query.includes('/')) return null
    return { query, startIndex: i }
  }
  return null
}

/** `/` 筛选：把 `_` / `-` / `.` 视作同一分隔符，便于 `create_web` 命中 `create-web` */
function normalizeSlashSeparators(value: string): string {
  return value.replace(/[_.-]+/g, '-')
}

/** 去掉分隔符与空白，便于 `createweb` 命中 `create-web` */
function compactSlashText(value: string): string {
  return value.replace(/[_.\-\s]+/g, '')
}

function slashQueryHitsHaystack(haystackLower: string, q: string): boolean {
  if (haystackLower.includes(q)) return true
  if (normalizeSlashSeparators(haystackLower).includes(normalizeSlashSeparators(q))) return true
  return compactSlashText(haystackLower).includes(compactSlashText(q))
}

export function skillMatchesSlashQuery(skill: SkillLike, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystacks = [
    skill.name,
    skillDisplayTitle(skill),
    skill.metadata?.summary ?? '',
    skill.description ?? '',
  ].map(h => h.toLowerCase())
  // 多 token（AND）：按空白与 `_.-` 切分；每个 token 须在任一 haystack 上命中
  const tokens = q.split(/[\s_.-]+/).filter(Boolean)
  if (!tokens.length) {
    return haystacks.some(h => slashQueryHitsHaystack(h, q))
  }
  return tokens.every(token => haystacks.some(h => slashQueryHitsHaystack(h, token)))
}
