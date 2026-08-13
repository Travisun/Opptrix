/**
 * 计划任务表 — scheduled_jobs / scheduled_job_runs。
 * Schema 幂等：CREATE IF NOT EXISTS + meta 标记 schedule_schema_v1。
 */
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export const SCHEDULE_SCHEMA_MIGRATION_KEY = 'schedule_schema_v1'

export type ScheduleJobKind = 'agent_prompt' | 'shell_script'
export type ScheduleKind = 'once' | 'interval' | 'cron'
export type ScheduleOsStatus = 'synced' | 'pending' | 'error' | 'n/a'
export type ScheduleRunTrigger = 'timer' | 'os' | 'manual' | 'agent'
export type ScheduleRunStatus = 'running' | 'ok' | 'error' | 'skipped' | 'interrupted'

/** running lease 超过该时长视为崩溃遗留，强制收尾后允许再次领取 */
export const SCHEDULE_STALE_RUN_MS = 45 * 60 * 1000

/** 每个 job 在 scheduled_job_runs 中最多保留的最近记录数 */
export const SCHEDULE_MAX_RUNS_PER_JOB = 100

export interface OnceSchedule {
  run_at: string
}

export interface IntervalSchedule {
  every_sec: number
  anchor?: string
}

export interface CronSchedule {
  expression: string
}

export type ScheduleSpec = OnceSchedule | IntervalSchedule | CronSchedule

export interface AgentPromptPayload {
  prompt: string
  session_id?: string
  expert_id?: string
  model?: string
}

export interface ShellScriptPayload {
  argv: string[]
  cwd?: string
  root_id?: string
}

export type SchedulePayload = AgentPromptPayload | ShellScriptPayload

export interface ScheduleSettings {
  master_enabled: boolean
  /**
   * 兼容旧版「关闭后仍注册 OS tick」开关；产品已废除系统 crontab，
   * 默认 false，API 忽略写入，仅进程内（托盘/前台）执行。
   */
  run_when_closed: boolean
  /** 登录项以 `--background` 托盘常驻（与 OS tick 无关） */
  autostart: boolean
  allow_shell_scripts: boolean
  os_tick_status?: ScheduleOsStatus
  os_tick_error?: string | null
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  master_enabled: true,
  run_when_closed: false,
  autostart: true,
  allow_shell_scripts: true,
  os_tick_status: 'n/a',
  os_tick_error: null,
}

export const SCHEDULE_SETTINGS_NS = 'schedule'
export const SCHEDULE_SETTINGS_ID = 'settings'

const SETTINGS_NS = SCHEDULE_SETTINGS_NS
const SETTINGS_ID = SCHEDULE_SETTINGS_ID

export interface ScheduledJob {
  id: string
  title: string
  enabled: boolean
  kind: ScheduleJobKind
  schedule_kind: ScheduleKind
  schedule: ScheduleSpec
  payload: SchedulePayload
  os_registration_id: string | null
  os_status: ScheduleOsStatus
  next_run_at: string | null
  last_run_at: string | null
  last_status: string | null
  created_at: string
  updated_at: string
}

export interface ScheduledJobRun {
  id: string
  job_id: string
  started_at: string
  finished_at: string | null
  status: ScheduleRunStatus | string
  trigger: ScheduleRunTrigger
  summary: string | null
  error: string | null
  session_id: string | null
}

export interface CreateScheduledJobInput {
  title: string
  enabled?: boolean
  kind: ScheduleJobKind
  schedule_kind: ScheduleKind
  schedule: ScheduleSpec
  payload: SchedulePayload
  os_registration_id?: string | null
  os_status?: ScheduleOsStatus
}

export interface UpdateScheduledJobInput {
  title?: string
  enabled?: boolean
  kind?: ScheduleJobKind
  schedule_kind?: ScheduleKind
  schedule?: ScheduleSpec
  payload?: SchedulePayload
  os_registration_id?: string | null
  os_status?: ScheduleOsStatus
  next_run_at?: string | null
  last_run_at?: string | null
  last_status?: string | null
}

interface JobRow {
  id: string
  title: string
  enabled: number
  kind: string
  schedule_kind: string
  schedule_json: string
  payload_json: string
  os_registration_id: string | null
  os_status: string
  next_run_at: string | null
  last_run_at: string | null
  last_status: string | null
  created_at: string
  updated_at: string
}

interface RunRow {
  id: string
  job_id: string
  started_at: string
  finished_at: string | null
  status: string
  trigger: string
  summary: string | null
  error: string | null
  session_id: string | null
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function rowToJob(row: JobRow): ScheduledJob {
  return {
    id: row.id,
    title: row.title,
    enabled: row.enabled === 1,
    kind: row.kind as ScheduleJobKind,
    schedule_kind: row.schedule_kind as ScheduleKind,
    schedule: parseJson<ScheduleSpec>(row.schedule_json, { every_sec: 60 }),
    payload: parseJson<SchedulePayload>(row.payload_json, { prompt: '' }),
    os_registration_id: row.os_registration_id,
    os_status: row.os_status as ScheduleOsStatus,
    next_run_at: row.next_run_at,
    last_run_at: row.last_run_at,
    last_status: row.last_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function rowToRun(row: RunRow): ScheduledJobRun {
  return {
    id: row.id,
    job_id: row.job_id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    status: row.status,
    trigger: row.trigger as ScheduleRunTrigger,
    summary: row.summary,
    error: row.error,
    session_id: row.session_id,
  }
}

export function initScheduleSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      kind TEXT NOT NULL,
      schedule_kind TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      os_registration_id TEXT,
      os_status TEXT NOT NULL DEFAULT 'n/a',
      next_run_at TEXT,
      last_run_at TEXT,
      last_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due
      ON scheduled_jobs(enabled, next_run_at);

    CREATE TABLE IF NOT EXISTS scheduled_job_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      summary TEXT,
      error TEXT,
      session_id TEXT,
      FOREIGN KEY (job_id) REFERENCES scheduled_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_started
      ON scheduled_job_runs(job_id, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_active
      ON scheduled_job_runs(job_id, status, finished_at);
  `)
}

type DocGetter = <T>(namespace: string, id: string) => T | null
type DocSetter = (namespace: string, id: string, data: unknown) => void

export class ScheduleRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly getDocument: DocGetter,
    private readonly setDocument: DocSetter,
  ) {
    initScheduleSchema(db)
  }

  getSettings(): ScheduleSettings {
    const raw = this.getDocument<Partial<ScheduleSettings>>(SETTINGS_NS, SETTINGS_ID)
    return {
      ...DEFAULT_SCHEDULE_SETTINGS,
      ...raw,
      // OS tick 已废除：始终 false（兼容旧库中 true）
      run_when_closed: false,
      os_tick_error: raw?.os_tick_error ?? null,
    }
  }

  patchSettings(patch: Partial<ScheduleSettings>): ScheduleSettings {
    const next: ScheduleSettings = {
      ...this.getSettings(),
      ...patch,
      run_when_closed: false,
    }
    this.setDocument(SETTINGS_NS, SETTINGS_ID, next)
    return next
  }

  listJobs(): ScheduledJob[] {
    const rows = this.db.prepare(`
      SELECT * FROM scheduled_jobs
      ORDER BY created_at DESC
    `).all() as JobRow[]
    return rows.map(rowToJob)
  }

  getJob(id: string): ScheduledJob | null {
    const row = this.db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? rowToJob(row) : null
  }

  createJob(input: CreateScheduledJobInput, nextRunAt: string | null): ScheduledJob {
    const now = new Date().toISOString()
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO scheduled_jobs (
        id, title, enabled, kind, schedule_kind, schedule_json, payload_json,
        os_registration_id, os_status, next_run_at, last_run_at, last_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(
      id,
      input.title.trim(),
      input.enabled === false ? 0 : 1,
      input.kind,
      input.schedule_kind,
      JSON.stringify(input.schedule),
      JSON.stringify(input.payload),
      input.os_registration_id ?? null,
      input.os_status ?? 'n/a',
      nextRunAt,
      now,
      now,
    )
    const job = this.getJob(id)
    if (!job) throw new Error('failed to create scheduled job')
    return job
  }

  updateJob(id: string, patch: UpdateScheduledJobInput): ScheduledJob | null {
    const current = this.getJob(id)
    if (!current) return null
    const updatedAt = new Date().toISOString()
    const next: ScheduledJob = {
      ...current,
      title: patch.title ?? current.title,
      enabled: patch.enabled ?? current.enabled,
      kind: patch.kind ?? current.kind,
      schedule_kind: patch.schedule_kind ?? current.schedule_kind,
      schedule: patch.schedule ?? current.schedule,
      payload: patch.payload ?? current.payload,
      os_registration_id: patch.os_registration_id !== undefined
        ? patch.os_registration_id
        : current.os_registration_id,
      os_status: patch.os_status ?? current.os_status,
      next_run_at: patch.next_run_at !== undefined ? patch.next_run_at : current.next_run_at,
      last_run_at: patch.last_run_at !== undefined ? patch.last_run_at : current.last_run_at,
      last_status: patch.last_status !== undefined ? patch.last_status : current.last_status,
      updated_at: updatedAt,
    }
    this.db.prepare(`
      UPDATE scheduled_jobs SET
        title = ?, enabled = ?, kind = ?, schedule_kind = ?, schedule_json = ?,
        payload_json = ?, os_registration_id = ?, os_status = ?,
        next_run_at = ?, last_run_at = ?, last_status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.title,
      next.enabled ? 1 : 0,
      next.kind,
      next.schedule_kind,
      JSON.stringify(next.schedule),
      JSON.stringify(next.payload),
      next.os_registration_id,
      next.os_status,
      next.next_run_at,
      next.last_run_at,
      next.last_status,
      next.updated_at,
      id,
    )
    return this.getJob(id)
  }

  deleteJob(id: string): boolean {
    this.db.prepare('DELETE FROM scheduled_job_runs WHERE job_id = ?').run(id)
    const result = this.db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(id)
    return result.changes > 0
  }

  listDueJobs(nowIso: string): ScheduledJob[] {
    const rows = this.db.prepare(`
      SELECT * FROM scheduled_jobs
      WHERE enabled = 1
        AND next_run_at IS NOT NULL
        AND next_run_at <= ?
      ORDER BY next_run_at ASC
    `).all(nowIso) as JobRow[]
    return rows.map(rowToJob)
  }

  listActiveRunsForJob(jobId: string): ScheduledJobRun[] {
    const rows = this.db.prepare(`
      SELECT * FROM scheduled_job_runs
      WHERE job_id = ?
        AND status = 'running'
        AND finished_at IS NULL
      ORDER BY started_at DESC
    `).all(jobId) as RunRow[]
    return rows.map(rowToRun)
  }

  /**
   * 将超时仍 running 的 lease 强制收尾为 interrupted，避免进程崩溃后永久卡死。
   * @returns 收尾条数
   */
  reconcileStaleRuns(
    nowIso: string = new Date().toISOString(),
    staleMs: number = SCHEDULE_STALE_RUN_MS,
  ): number {
    const cutoffMs = new Date(nowIso).getTime() - Math.max(0, staleMs)
    if (Number.isNaN(cutoffMs)) return 0
    const cutoffIso = new Date(cutoffMs).toISOString()
    const stale = this.db.prepare(`
      SELECT * FROM scheduled_job_runs
      WHERE status = 'running'
        AND finished_at IS NULL
        AND started_at <= ?
      ORDER BY started_at ASC
    `).all(cutoffIso) as RunRow[]
    let n = 0
    for (const row of stale) {
      const done = this.finishRun(row.id, {
        status: 'interrupted',
        error: '执行超时或进程中断，已释放占用以便重新领取',
        summary: 'stale_lease',
      }, { prune: false })
      if (done) {
        n += 1
        this.updateJob(row.job_id, {
          last_run_at: nowIso,
          last_status: 'interrupted',
        })
      }
    }
    return n
  }

  /**
   * 每个 job 只保留最近 keep 条 runs；deleteJob 仍会整表删 runs。
   * @returns 删除条数
   */
  pruneJobRuns(jobId: string, keep: number = SCHEDULE_MAX_RUNS_PER_JOB): number {
    const limit = Math.max(1, Math.floor(keep))
    // SQLite：ORDER BY + LIMIT 在 NOT IN 子查询中不可靠；用 OFFSET 丢掉较旧行
    const result = this.db.prepare(`
      DELETE FROM scheduled_job_runs
      WHERE rowid IN (
        SELECT rowid FROM scheduled_job_runs
        WHERE job_id = ?
        ORDER BY started_at DESC, rowid DESC
        LIMIT -1 OFFSET ?
      )
    `).run(jobId, limit)
    return result.changes
  }

  /**
   * 乐观领取：推进 next_run_at + 写入 running lease，防止并发 tick 重复领取。
   * 真正下次时间在 finish 时由 ScheduleService 回写。
   */
  tryClaimDueJob(
    job: ScheduledJob,
    nowIso: string,
    leaseUntilIso: string,
    trigger: ScheduleRunTrigger = 'timer',
  ): ScheduledJobRun | null {
    this.reconcileStaleRuns(nowIso)
    if (this.listActiveRunsForJob(job.id).length > 0) return null
    const claimed = this.db.prepare(`
      UPDATE scheduled_jobs
      SET next_run_at = ?, updated_at = ?
      WHERE id = ?
        AND enabled = 1
        AND next_run_at IS NOT NULL
        AND next_run_at = ?
        AND next_run_at <= ?
    `).run(leaseUntilIso, nowIso, job.id, job.next_run_at, nowIso)
    if (claimed.changes === 0) return null
    return this.startRun(job.id, trigger)
  }

  startRun(jobId: string, trigger: ScheduleRunTrigger): ScheduledJobRun {
    const run: ScheduledJobRun = {
      id: randomUUID(),
      job_id: jobId,
      started_at: new Date().toISOString(),
      finished_at: null,
      status: 'running',
      trigger,
      summary: null,
      error: null,
      session_id: null,
    }
    this.db.prepare(`
      INSERT INTO scheduled_job_runs (
        id, job_id, started_at, finished_at, status, trigger, summary, error, session_id
      ) VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, NULL)
    `).run(run.id, run.job_id, run.started_at, run.status, run.trigger)
    this.pruneJobRuns(jobId)
    return run
  }

  finishRun(
    runId: string,
    result: {
      status: ScheduleRunStatus | string
      summary?: string | null
      error?: string | null
      session_id?: string | null
    },
    opts?: { prune?: boolean },
  ): ScheduledJobRun | null {
    const finishedAt = new Date().toISOString()
    this.db.prepare(`
      UPDATE scheduled_job_runs SET
        finished_at = ?,
        status = ?,
        summary = ?,
        error = ?,
        session_id = ?
      WHERE id = ?
    `).run(
      finishedAt,
      result.status,
      result.summary ?? null,
      result.error ?? null,
      result.session_id ?? null,
      runId,
    )
    const row = this.db.prepare('SELECT * FROM scheduled_job_runs WHERE id = ?').get(runId) as RunRow | undefined
    if (!row) return null
    if (opts?.prune !== false) {
      this.pruneJobRuns(row.job_id)
    }
    return rowToRun(row)
  }

  listRuns(jobId: string, limit = 50): ScheduledJobRun[] {
    const rows = this.db.prepare(`
      SELECT * FROM scheduled_job_runs
      WHERE job_id = ?
      ORDER BY started_at DESC, rowid DESC
      LIMIT ?
    `).all(jobId, limit) as RunRow[]
    return rows.map(rowToRun)
  }

  getRun(id: string): ScheduledJobRun | null {
    const row = this.db.prepare('SELECT * FROM scheduled_job_runs WHERE id = ?').get(id) as RunRow | undefined
    return row ? rowToRun(row) : null
  }
}
