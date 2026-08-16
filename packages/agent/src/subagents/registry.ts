/**
 * Subagent 运行注册表 — 内存索引 + user-store `subagent_run` 持久化。
 */

import { randomUUID } from 'node:crypto'
import { getUserDataStore } from '@opptrix/user-store'
import type {
  CreateSubagentRunInput,
  SubagentRun,
  SubagentRunStatus,
} from './types.js'

const NAMESPACE = 'subagent_run'

export class SubagentRunRegistry {
  /** parentSessionId → run ids */
  private readonly byParent = new Map<string, Set<string>>()
  /** run id → run（内存热缓存；与盘一致） */
  private readonly byId = new Map<string, SubagentRun>()

  private index(run: SubagentRun): void {
    this.byId.set(run.id, run)
    let set = this.byParent.get(run.parentSessionId)
    if (!set) {
      set = new Set()
      this.byParent.set(run.parentSessionId, set)
    }
    set.add(run.id)
  }

  private unindex(run: SubagentRun): void {
    this.byId.delete(run.id)
    const set = this.byParent.get(run.parentSessionId)
    if (set) {
      set.delete(run.id)
      if (set.size === 0) this.byParent.delete(run.parentSessionId)
    }
  }

  private persist(run: SubagentRun): void {
    getUserDataStore().setDocument(NAMESPACE, run.id, run)
    this.index(run)
  }

  create(input: CreateSubagentRunInput): SubagentRun {
    const now = new Date().toISOString()
    const label = input.label?.trim()
      || input.role.name.trim()
      || '子任务'
    const run: SubagentRun = {
      id: randomUUID(),
      parentSessionId: input.parentSessionId,
      rootSessionId: input.rootSessionId,
      childSessionId: input.childSessionId,
      label,
      role: input.role,
      task: input.task,
      context: input.context,
      resultSchema: input.resultSchema,
      mode: input.mode ?? 'foreground',
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    }
    this.persist(run)
    return run
  }

  get(runId: string): SubagentRun | null {
    const cached = this.byId.get(runId)
    if (cached) return cached
    const raw = getUserDataStore().getDocument<SubagentRun>(NAMESPACE, runId)
    if (!raw) return null
    this.index(raw)
    return raw
  }

  listByParent(parentSessionId: string): SubagentRun[] {
    const ids = this.byParent.get(parentSessionId)
    if (ids?.size) {
      return [...ids]
        .map(id => this.get(id))
        .filter((r): r is SubagentRun => Boolean(r))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    // 冷启动：扫盘按 parent 过滤
    const all = getUserDataStore().listDocuments<SubagentRun>(NAMESPACE)
    const matched = all.filter(r => r.parentSessionId === parentSessionId)
    for (const r of matched) this.index(r)
    return matched.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listRunningByParent(parentSessionId: string): SubagentRun[] {
    return this.listByParent(parentSessionId).filter(
      r => r.status === 'running' || r.status === 'queued',
    )
  }

  /**
   * 同父下 active（queued|running）去重：优先 label，其次 role.name。
   */
  findActiveDuplicate(
    parentSessionId: string,
    opts: { label?: string; roleName?: string },
  ): SubagentRun | null {
    const active = this.listRunningByParent(parentSessionId)
    const label = opts.label?.trim()
    if (label) {
      const hit = active.find(r => r.label.trim() === label)
      if (hit) return hit
    }
    const roleName = opts.roleName?.trim()
    if (roleName) {
      return active.find(r => r.role.name.trim() === roleName) ?? null
    }
    return null
  }

  /** 按 child session 定位 run（同父下通常唯一） */
  findByChildSessionId(
    childSessionId: string,
    parentSessionId?: string,
  ): SubagentRun | null {
    const childId = childSessionId.trim()
    if (!childId) return null
    if (parentSessionId?.trim()) {
      return this.listByParent(parentSessionId.trim()).find(r => r.childSessionId === childId) ?? null
    }
    for (const run of this.byId.values()) {
      if (run.childSessionId === childId) return run
    }
    const all = getUserDataStore().listDocuments<SubagentRun>(NAMESPACE)
    for (const r of all) {
      this.index(r)
      if (r.childSessionId === childId) return r
    }
    return null
  }

  update(
    runId: string,
    patch: Partial<Pick<
      SubagentRun,
      | 'status'
      | 'result'
      | 'error'
      | 'summary'
      | 'needsParentAction'
      | 'startedAt'
      | 'finishedAt'
      | 'task'
      | 'context'
      | 'role'
      | 'resultSchema'
      | 'label'
      | 'mode'
    >>,
  ): SubagentRun | null {
    const cur = this.get(runId)
    if (!cur) return null
    const next: SubagentRun = {
      ...cur,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    this.persist(next)
    return next
  }

  setStatus(runId: string, status: SubagentRunStatus, extra?: Partial<SubagentRun>): SubagentRun | null {
    return this.update(runId, { status, ...extra })
  }

  delete(runId: string): boolean {
    const cur = this.get(runId)
    if (!cur) {
      getUserDataStore().deleteDocument(NAMESPACE, runId)
      return false
    }
    this.unindex(cur)
    getUserDataStore().deleteDocument(NAMESPACE, runId)
    return true
  }

  /** 删除父下全部 runs（不 cancel 会话 — 由 cascade 负责） */
  deleteByParent(parentSessionId: string): number {
    const runs = this.listByParent(parentSessionId)
    let n = 0
    for (const r of runs) {
      if (this.delete(r.id)) n += 1
    }
    return n
  }

  /** 测试用：清空内存索引（不扫盘删） */
  clearMemoryForTests(): void {
    this.byId.clear()
    this.byParent.clear()
  }
}

let defaultRegistry: SubagentRunRegistry | null = null

export function getSubagentRunRegistry(): SubagentRunRegistry {
  if (!defaultRegistry) defaultRegistry = new SubagentRunRegistry()
  return defaultRegistry
}

export function resetSubagentRunRegistryForTests(): void {
  defaultRegistry = new SubagentRunRegistry()
}
