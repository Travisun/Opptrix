/**
 * 会话级已激活 Agent Skills — 同 session 累积，最多 MAX_ACTIVATED。
 * 支持依赖激活：技能正文中的 `@skill:dep` 引用会被递归激活（带循环检测与上限保护）。
 */

export const MAX_ACTIVATED_AGENT_SKILLS = 3

export interface ActivateOptions {
  /** 解析技能依赖；返回依赖技能名列表（不含自身）。无则不解析依赖。 */
  resolveDeps?: (name: string) => string[]
}

export interface ActivateResult {
  activated: string[]
  skipped: string[]
  active: string[]
  /** 依赖激活产生的提示（如循环检测、超上限跳过） */
  depNotes: string[]
}

export class AgentSkillSessionStore {
  private readonly bySession = new Map<string, string[]>()

  getActivated(sessionId: string): readonly string[] {
    return this.bySession.get(sessionId) ?? []
  }

  activate(
    sessionId: string,
    skillNames: string[],
    opts?: ActivateOptions,
  ): ActivateResult {
    const current = [...(this.bySession.get(sessionId) ?? [])]
    const activated: string[] = []
    const skipped: string[] = []
    const depNotes: string[] = []
    const visiting = new Set<string>()

    const pushName = (name: string, isDep: boolean): void => {
      if (!name) {
        if (!isDep) skipped.push('(empty)')
        return
      }
      if (current.includes(name)) {
        if (!isDep) activated.push(name)
        return
      }
      if (current.length >= MAX_ACTIVATED_AGENT_SKILLS) {
        if (isDep) depNotes.push(`依赖「${name}」未激活：已达上限 ${MAX_ACTIVATED_AGENT_SKILLS}`)
        else skipped.push(name)
        return
      }
      current.push(name)
      if (isDep) activated.push(name)
      else activated.push(name)
    }

    const visit = (name: string, isDep: boolean): void => {
      if (visiting.has(name)) {
        depNotes.push(`检测到循环依赖「${name}」，已跳过`)
        return
      }
      visiting.add(name)
      pushName(name, isDep)
      // 递归激活依赖（仅在主技能成功激活或已存在时）
      if (opts?.resolveDeps && current.includes(name)) {
        for (const dep of opts.resolveDeps(name)) {
          visit(dep, true)
        }
      }
      visiting.delete(name)
    }

    for (const raw of skillNames) {
      const name = String(raw ?? '').trim()
      visit(name, false)
    }

    this.bySession.set(sessionId, current)
    return { activated, skipped, active: [...current], depNotes }
  }

  clear(sessionId: string) {
    this.bySession.delete(sessionId)
  }
}
