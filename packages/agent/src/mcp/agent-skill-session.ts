/**
 * 会话级已激活 Agent Skills — 同 session 累积，最多 MAX_ACTIVATED。
 */

export const MAX_ACTIVATED_AGENT_SKILLS = 3

export class AgentSkillSessionStore {
  private readonly bySession = new Map<string, string[]>()

  getActivated(sessionId: string): readonly string[] {
    return this.bySession.get(sessionId) ?? []
  }

  activate(
    sessionId: string,
    skillNames: string[],
  ): { activated: string[]; skipped: string[]; active: string[] } {
    const current = [...(this.bySession.get(sessionId) ?? [])]
    const activated: string[] = []
    const skipped: string[] = []
    for (const raw of skillNames) {
      const name = String(raw ?? '').trim()
      if (!name) {
        skipped.push('(empty)')
        continue
      }
      if (current.includes(name)) {
        activated.push(name)
        continue
      }
      if (current.length >= MAX_ACTIVATED_AGENT_SKILLS) {
        skipped.push(name)
        continue
      }
      current.push(name)
      activated.push(name)
    }
    this.bySession.set(sessionId, current)
    return { activated, skipped, active: [...current] }
  }

  clear(sessionId: string) {
    this.bySession.delete(sessionId)
  }
}
