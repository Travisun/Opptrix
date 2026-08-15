/**
 * 从 Agent Skill 声明解析须激活的 Tool Pack。
 * allowed-tools / required-packs 仅用于「加载哪些 pack」，不是工具硬白名单。
 */
import {
  type ToolPackId,
  isToolPackId,
  packIdForTool,
} from '@opptrix/shared'

/** 空格或逗号分隔的 token（工具名或 pack_id） */
export function splitSkillDeclarationTokens(raw: string | undefined | null): string[] {
  if (raw == null) return []
  const s = String(raw).trim()
  if (!s) return []
  return s.split(/[\s,]+/).map(t => t.trim()).filter(Boolean)
}

export type SkillPackDeclaration = {
  allowedTools?: string
  metadata?: Record<string, string>
}

/**
 * 收集技能声明的 pack：
 * 1. `allowed-tools`（空格分隔工具名）→ `packIdForTool`（未知工具名忽略）
 * 2. metadata `required-packs` / `requiredPacks`（空格/逗号分隔 pack_id）
 */
export function resolvePackIdsFromSkill(skill: SkillPackDeclaration): ToolPackId[] {
  const packs = new Set<ToolPackId>()

  for (const toolName of splitSkillDeclarationTokens(skill.allowedTools)) {
    const pack = packIdForTool(toolName)
    if (pack) packs.add(pack)
  }

  const meta = skill.metadata
  if (meta) {
    const requiredRaw = meta['required-packs'] ?? meta.requiredPacks
    for (const id of splitSkillDeclarationTokens(requiredRaw)) {
      if (isToolPackId(id)) packs.add(id)
    }
  }

  return [...packs]
}
