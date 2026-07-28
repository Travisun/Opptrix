import type {
  CreateScheduledJobInput,
  CronSchedule,
  IntervalSchedule,
  OnceSchedule,
  ScheduleKind,
  SchedulePayload,
  ScheduleRepository,
  ScheduleRunTrigger,
  ScheduleSettings,
  ScheduleSpec,
  ScheduledJob,
  ScheduledJobRun,
  UpdateScheduledJobInput,
  UserDataStore,
} from '@opptrix/user-store'
import { getUserDataStore } from '@opptrix/user-store'
import { nextCronOccurrence } from './next-run.js'

export type JobExecutor = (job: ScheduledJob, run: ScheduledJobRun) => Promise<{
  summary?: string | null
  session_id?: string | null
}>

export type ScheduleStoreLike = ScheduleRepository | Pick<UserDataStore, 'schedule'>

function resolveRepo(storeOrRepo: ScheduleStoreLike): ScheduleRepository {
  if ('schedule' in storeOrRepo && storeOrRepo.schedule && typeof storeOrRepo.schedule.getSettings === 'function') {
    return storeOrRepo.schedule
  }
  return storeOrRepo as ScheduleRepository
}

function isOnce(s: ScheduleSpec, kind: ScheduleKind): s is OnceSchedule {
  return kind === 'once'
}

function isInterval(s: ScheduleSpec, kind: ScheduleKind): s is IntervalSchedule {
  return kind === 'interval'
}

function isCron(s: ScheduleSpec, kind: ScheduleKind): s is CronSchedule {
  return kind === 'cron'
}

export function computeNextRunAt(
  scheduleKind: ScheduleKind,
  schedule: ScheduleSpec,
  from: Date = new Date(),
  opts?: { afterSuccess?: boolean },
): string | null {
  if (isOnce(schedule, scheduleKind)) {
    const at = new Date(schedule.run_at)
    if (Number.isNaN(at.getTime())) return null
    if (opts?.afterSuccess) return null
    return at.getTime() > from.getTime() ? at.toISOString() : null
  }
  if (isInterval(schedule, scheduleKind)) {
    const every = Math.max(30, Math.floor(schedule.every_sec || 0))
    const anchor = schedule.anchor ? new Date(schedule.anchor) : from
    const base = Number.isNaN(anchor.getTime()) ? from : anchor
    let next = base.getTime()
    if (next <= from.getTime()) {
      const elapsed = from.getTime() - next
      const steps = Math.floor(elapsed / (every * 1000)) + 1
      next = next + steps * every * 1000
    }
    return new Date(next).toISOString()
  }
  if (isCron(schedule, scheduleKind)) {
    const n = nextCronOccurrence(schedule.expression, from)
    return n ? n.toISOString() : null
  }
  return null
}

/** 兼容 (job, fromDate) 调用形态 */
export function computeNextRunAtForJob(
  job: Pick<ScheduledJob, 'schedule_kind' | 'schedule'>,
  fromDate: Date = new Date(),
): string | null {
  return computeNextRunAt(job.schedule_kind, job.schedule, fromDate)
}

export function validateCreateInput(input: CreateScheduledJobInput): string | null {
  if (!input.title?.trim()) return '标题不能为空'
  if (input.kind !== 'agent_prompt' && input.kind !== 'shell_script') {
    return '任务类型无效'
  }
  if (!['once', 'interval', 'cron'].includes(input.schedule_kind)) {
    return '调度类型无效'
  }
  if (input.kind === 'agent_prompt') {
    const p = input.payload as { prompt?: string }
    if (!p.prompt?.trim()) return '提示词不能为空'
  }
  if (input.kind === 'shell_script') {
    const p = input.payload as { argv?: unknown }
    if (!Array.isArray(p.argv) || p.argv.length === 0) return '脚本命令不能为空'
  }
  const next = computeNextRunAt(input.schedule_kind, input.schedule, new Date())
  if (input.schedule_kind === 'once' && !next) return '执行时间必须晚于现在'
  if (input.schedule_kind === 'interval') {
    const s = input.schedule as IntervalSchedule
    if (!s.every_sec || s.every_sec < 30) return '间隔至少 30 秒'
  }
  if (input.schedule_kind === 'cron') {
    const s = input.schedule as CronSchedule
    if (!nextCronOccurrence(s.expression, new Date())) return '周期表达式无效'
  }
  return null
}

export class ScheduleService {
  private timer: ReturnType<typeof setInterval> | null = null
  private queue: Promise<void> = Promise.resolve()
  private executor: JobExecutor | undefined
  private readonly repo: ScheduleRepository

  constructor(
    storeOrRepo: ScheduleStoreLike,
    executor?: JobExecutor,
  ) {
    this.repo = resolveRepo(storeOrRepo)
    this.executor = executor
  }

  setExecutor(executor: JobExecutor): void {
    this.executor = executor
  }

  getSettings(): ScheduleSettings {
    return this.repo.getSettings()
  }

  patchSettings(patch: Partial<ScheduleSettings>): ScheduleSettings {
    return this.repo.patchSettings(patch)
  }

  listJobs(): ScheduledJob[] {
    return this.repo.listJobs()
  }

  getJob(id: string): ScheduledJob | null {
    return this.repo.getJob(id)
  }

  createJob(input: CreateScheduledJobInput): ScheduledJob {
    const err = validateCreateInput(input)
    if (err) throw new Error(err)
    const settings = this.repo.getSettings()
    if (input.kind === 'shell_script' && !settings.allow_shell_scripts) {
      throw new Error('尚未允许计划任务运行脚本，请先在设置中开启')
    }
    const next = computeNextRunAt(input.schedule_kind, input.schedule, new Date())
    return this.repo.createJob(input, next)
  }

  updateJob(id: string, patch: UpdateScheduledJobInput): ScheduledJob | null {
    const cur = this.repo.getJob(id)
    if (!cur) return null
    const schedule_kind = patch.schedule_kind ?? cur.schedule_kind
    const schedule = patch.schedule ?? cur.schedule
    const kind = patch.kind ?? cur.kind
    const payload = (patch.payload ?? cur.payload) as SchedulePayload
    if (kind === 'shell_script' && !this.repo.getSettings().allow_shell_scripts) {
      if (patch.kind === 'shell_script' || patch.payload) {
        throw new Error('尚未允许计划任务运行脚本，请先在设置中开启')
      }
    }
    let next_run_at = patch.next_run_at
    if (patch.schedule || patch.schedule_kind || patch.enabled === true) {
      next_run_at = computeNextRunAt(schedule_kind, schedule, new Date())
    }
    return this.repo.updateJob(id, {
      ...patch,
      payload,
      next_run_at: next_run_at !== undefined ? next_run_at : undefined,
    })
  }

  deleteJob(id: string): boolean {
    return this.repo.deleteJob(id)
  }

  enableJob(id: string): ScheduledJob | null {
    const cur = this.repo.getJob(id)
    if (!cur) return null
    const next = computeNextRunAt(cur.schedule_kind, cur.schedule, new Date())
    return this.repo.updateJob(id, { enabled: true, next_run_at: next })
  }

  disableJob(id: string): ScheduledJob | null {
    return this.repo.updateJob(id, { enabled: false })
  }

  listRuns(jobId: string, limit?: number): ScheduledJobRun[] {
    return this.repo.listRuns(jobId, limit)
  }

  recordRunStart(jobId: string, trigger: ScheduleRunTrigger = 'manual'): ScheduledJobRun {
    return this.repo.startRun(jobId, trigger)
  }

  recordRunFinish(
    runId: string,
    result: {
      status: string
      summary?: string | null
      error?: string | null
      session_id?: string | null
    },
  ): ScheduledJobRun | null {
    return this.repo.finishRun(runId, result)
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick({ trigger: 'timer' })
    }, 20_000)
    if (typeof this.timer.unref === 'function') this.timer.unref()
    void this.tick({ trigger: 'timer' })
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * 扫描到期任务。master 关闭时跳过。
   * 通过乐观 claim（推进 next_run + running lease）保证幂等。
   */
  async tick(opts: { trigger: ScheduleRunTrigger }): Promise<{ due: string[]; ran: string[]; skipped: string[] }> {
    const dueIds: string[] = []
    const ran: string[] = []
    const skipped: string[] = []
    const settings = this.repo.getSettings()
    if (!settings.master_enabled) {
      return { due: dueIds, ran, skipped }
    }
    const now = new Date()
    const nowIso = now.toISOString()
    const due = this.repo.listDueJobs(nowIso)
    for (const job of due) {
      dueIds.push(job.id)
      if (this.repo.listActiveRunsForJob(job.id).length > 0) {
        skipped.push(job.id)
        continue
      }
      const provisionalNext = computeNextRunAt(job.schedule_kind, job.schedule, now)
        ?? new Date(now.getTime() + 86_400_000).toISOString()
      const claimed = this.repo.tryClaimDueJob(job, nowIso, provisionalNext, opts.trigger)
      if (!claimed) {
        skipped.push(job.id)
        continue
      }
      await this.queueExecute(job, claimed)
      ran.push(job.id)
    }
    return { due: dueIds, ran, skipped }
  }

  async runNow(jobId: string, trigger: ScheduleRunTrigger = 'manual'): Promise<ScheduledJobRun> {
    const job = this.repo.getJob(jobId)
    if (!job) throw new Error('计划任务不存在')
    const run = this.repo.startRun(job.id, trigger)
    return this.queueExecute(job, run)
  }

  private queueExecute(job: ScheduledJob, run: ScheduledJobRun): Promise<ScheduledJobRun> {
    const done = new Promise<ScheduledJobRun>((resolve) => {
      this.queue = this.queue.then(async () => {
        await this.executeRun(job, run)
        resolve(this.repo.listRuns(job.id, 1)[0] ?? run)
      }).catch(async () => {
        resolve(this.repo.listRuns(job.id, 1)[0] ?? run)
      })
    })
    return done
  }

  private async executeRun(job: ScheduledJob, run: ScheduledJobRun): Promise<void> {
    try {
      if (!this.executor) {
        this.repo.finishRun(run.id, {
          status: 'skipped',
          summary: '执行器尚未就绪',
        })
        this.repo.updateJob(job.id, {
          last_run_at: new Date().toISOString(),
          last_status: 'skipped',
        })
        return
      }
      const result = await this.executor(job, run)
      this.repo.finishRun(run.id, {
        status: 'ok',
        summary: result.summary ?? null,
        session_id: result.session_id ?? null,
      })
      const after = new Date()
      if (job.schedule_kind === 'once') {
        this.repo.updateJob(job.id, {
          enabled: false,
          next_run_at: null,
          last_run_at: after.toISOString(),
          last_status: 'ok',
        })
      } else {
        const next = computeNextRunAt(job.schedule_kind, job.schedule, after)
        this.repo.updateJob(job.id, {
          next_run_at: next,
          last_run_at: after.toISOString(),
          last_status: 'ok',
        })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      this.repo.finishRun(run.id, { status: 'error', error: message })
      const after = new Date()
      const next = job.schedule_kind === 'once'
        ? null
        : computeNextRunAt(job.schedule_kind, job.schedule, after)
      this.repo.updateJob(job.id, {
        enabled: job.schedule_kind === 'once' ? false : job.enabled,
        next_run_at: next,
        last_run_at: after.toISOString(),
        last_status: 'error',
      })
    }
  }
}

let singleton: ScheduleService | null = null

export function createScheduleService(
  storeOrRepo?: ScheduleStoreLike,
  executor?: JobExecutor,
): ScheduleService {
  return new ScheduleService(storeOrRepo ?? getUserDataStore(), executor)
}

export function getScheduleService(): ScheduleService {
  if (!singleton) {
    singleton = createScheduleService()
  }
  return singleton
}

export function resetScheduleServiceSingleton(): void {
  singleton?.stop()
  singleton = null
}
