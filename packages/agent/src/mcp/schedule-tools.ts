import { getScheduleService } from '@opptrix/schedule'
import type {
  CreateScheduledJobInput,
  ScheduleJobKind,
  ScheduleKind,
  SchedulePayload,
  ScheduleSpec,
  UpdateScheduledJobInput,
} from '@opptrix/user-store'
import { TOOL_META } from '../tool-meta.js'

type JsonSchema = {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    items?: unknown
    default?: unknown
  }>
  required?: string[]
}

export interface ScheduleToolDef {
  name: string
  description: string
  category: string
  parameters: JsonSchema
  handler: (args: Record<string, unknown>) => Promise<unknown>
  meta?: (typeof TOOL_META)[string]
}

const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
  ({ type: 'object', properties, required })

function parseScheduleSpec(raw: unknown): ScheduleSpec | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as ScheduleSpec
}

function parsePayload(raw: unknown): SchedulePayload | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as SchedulePayload
}

function parseKind(raw: unknown): ScheduleJobKind | null {
  return raw === 'agent_prompt' || raw === 'shell_script' ? raw : null
}

function parseScheduleKind(raw: unknown): ScheduleKind | null {
  return raw === 'once' || raw === 'interval' || raw === 'cron' ? raw : null
}

function jobIdFromArgs(a: Record<string, unknown>): string {
  return String(a.job_id ?? a.id ?? '').trim()
}

export function buildScheduleTools(): ScheduleToolDef[] {
  const svc = () => getScheduleService()

  return [
    {
      name: 'list_scheduled_jobs',
      category: '计划任务',
      description: '列出全部计划任务（标题、类型、启用状态、下次执行时间、最近状态）',
      parameters: S({}),
      handler: async () => ({ jobs: svc().listJobs() }),
    },
    {
      name: 'get_scheduled_job',
      category: '计划任务',
      description: '读取单个计划任务详情',
      parameters: S({
        job_id: { type: 'string', description: '任务 id，来自 list_scheduled_jobs' },
      }, ['job_id']),
      handler: async (a: Record<string, unknown>) => {
        const id = jobIdFromArgs(a)
        if (!id) return { error: 'job_id 必填' }
        const job = svc().getJob(id)
        if (!job) return { error: '计划任务不存在' }
        return { job }
      },
    },
    {
      name: 'create_scheduled_job',
      category: '计划任务',
      description: '创建计划任务（智能体提示词或受控脚本）',
      parameters: S({
        title: { type: 'string', description: '任务标题' },
        kind: { type: 'string', description: 'agent_prompt 或 shell_script' },
        schedule_kind: { type: 'string', description: 'once / interval / cron' },
        schedule: { type: 'object', description: '调度参数：once.run_at / interval.every_sec / cron.expression' },
        payload: { type: 'object', description: 'agent_prompt: { prompt, session_id? }；shell_script: { argv, cwd? }' },
        enabled: { type: 'boolean', description: '是否启用，默认 true' },
      }, ['title', 'kind', 'schedule_kind', 'schedule', 'payload']),
      handler: async (a: Record<string, unknown>) => {
        const kind = parseKind(a.kind)
        const scheduleKind = parseScheduleKind(a.schedule_kind)
        const schedule = parseScheduleSpec(a.schedule)
        const payload = parsePayload(a.payload)
        if (!kind || !scheduleKind || !schedule || !payload) {
          return { error: 'kind、schedule_kind、schedule、payload 格式无效' }
        }
        const input: CreateScheduledJobInput = {
          title: String(a.title ?? '').trim(),
          kind,
          schedule_kind: scheduleKind,
          schedule,
          payload,
          enabled: a.enabled === false ? false : undefined,
        }
        try {
          const job = svc().createJob(input)
          return { job }
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
    },
    {
      name: 'update_scheduled_job',
      category: '计划任务',
      description: '更新计划任务（标题、调度、载荷、启用状态等）',
      parameters: S({
        job_id: { type: 'string', description: '任务 id' },
        title: { type: 'string', description: '新标题' },
        kind: { type: 'string', description: 'agent_prompt 或 shell_script' },
        schedule_kind: { type: 'string', description: 'once / interval / cron' },
        schedule: { type: 'object', description: '调度参数' },
        payload: { type: 'object', description: '任务载荷' },
        enabled: { type: 'boolean', description: '是否启用' },
      }, ['job_id']),
      handler: async (a: Record<string, unknown>) => {
        const id = jobIdFromArgs(a)
        if (!id) return { error: 'job_id 必填' }
        const patch: UpdateScheduledJobInput = {}
        if (a.title != null) patch.title = String(a.title)
        if (a.enabled != null) patch.enabled = Boolean(a.enabled)
        const kind = parseKind(a.kind)
        if (kind) patch.kind = kind
        const scheduleKind = parseScheduleKind(a.schedule_kind)
        if (scheduleKind) patch.schedule_kind = scheduleKind
        const schedule = parseScheduleSpec(a.schedule)
        if (schedule) patch.schedule = schedule
        const payload = parsePayload(a.payload)
        if (payload) patch.payload = payload
        try {
          const job = svc().updateJob(id, patch)
          if (!job) return { error: '计划任务不存在' }
          return { job }
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
    },
    {
      name: 'enable_scheduled_job',
      category: '计划任务',
      description: '启用计划任务并重新计算下次执行时间',
      parameters: S({
        job_id: { type: 'string', description: '任务 id' },
      }, ['job_id']),
      handler: async (a: Record<string, unknown>) => {
        const id = jobIdFromArgs(a)
        if (!id) return { error: 'job_id 必填' }
        const job = svc().enableJob(id)
        if (!job) return { error: '计划任务不存在' }
        return { job }
      },
    },
    {
      name: 'disable_scheduled_job',
      category: '计划任务',
      description: '暂停计划任务（不再自动执行）',
      parameters: S({
        job_id: { type: 'string', description: '任务 id' },
      }, ['job_id']),
      handler: async (a: Record<string, unknown>) => {
        const id = jobIdFromArgs(a)
        if (!id) return { error: 'job_id 必填' }
        const job = svc().disableJob(id)
        if (!job) return { error: '计划任务不存在' }
        return { job }
      },
    },
    {
      name: 'delete_scheduled_job',
      category: '计划任务',
      description: '删除计划任务；须 confirmed=true',
      parameters: S({
        job_id: { type: 'string', description: '任务 id' },
        confirmed: { type: 'boolean', description: '用户已确认删除' },
      }, ['job_id']),
      handler: async (a: Record<string, unknown>) => {
        const id = jobIdFromArgs(a)
        if (!id) return { error: 'job_id 必填' }
        const job = svc().getJob(id)
        if (!job) return { error: '计划任务不存在' }
        if (a.confirmed !== true) {
          return {
            needs_confirmation: true,
            summary: `删除计划任务「${job.title}」`,
            hint: '请先 ask_user 确认，再以 confirmed=true 调用',
          }
        }
        svc().deleteJob(id)
        return { ok: true, deleted: id }
      },
    },
    {
      name: 'run_scheduled_job_now',
      category: '计划任务',
      description: '立即执行一次计划任务（不影响原定下次时间以外的调度逻辑）',
      parameters: S({
        job_id: { type: 'string', description: '任务 id' },
      }, ['job_id']),
      handler: async (a: Record<string, unknown>) => {
        const id = jobIdFromArgs(a)
        if (!id) return { error: 'job_id 必填' }
        try {
          const run = await svc().runNow(id, 'agent')
          return { run }
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
    },
    {
      name: 'list_scheduled_job_runs',
      category: '计划任务',
      description: '查看计划任务的执行记录',
      parameters: S({
        job_id: { type: 'string', description: '任务 id' },
        limit: { type: 'number', description: '返回条数，默认 20，最大 50' },
      }, ['job_id']),
      handler: async (a: Record<string, unknown>) => {
        const id = jobIdFromArgs(a)
        if (!id) return { error: 'job_id 必填' }
        const rawLimit = typeof a.limit === 'number' ? a.limit : 20
        const limit = Math.min(50, Math.max(1, Math.floor(rawLimit)))
        const job = svc().getJob(id)
        if (!job) return { error: '计划任务不存在' }
        return { job_id: id, runs: svc().listRuns(id, limit) }
      },
    },
  ].map(t => ({ ...t, meta: TOOL_META[t.name] }))
}
