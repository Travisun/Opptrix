import type {
  AgentPromptPayload,
  ScheduleSettings,
  ScheduledJob,
  ScheduledJobRun,
  ShellScriptPayload,
} from '@opptrix/user-store'
import type { JobExecutor } from './service.js'

const SUMMARY_MAX = 500

export interface JobRunnerAgent {
  createSession(opts?: { title?: string; expertId?: string }): Promise<{ id: string }>
  chat(
    sessionId: string,
    message: string,
    modelRef?: string,
  ): Promise<{ reply: string; sessionId: string }>
  llmConfigured?: boolean
}

export interface ShellConfirmPayload {
  title: string
  prompt: string
  options: Array<{ id: string; label: string }>
  operation: 'overwrite' | 'delete'
  root_id: string
  path: string
}

export interface JobRunnerShell {
  run(
    params: {
      sessionId: string
      rootId: string
      cwdRel?: string
      argv: string[]
      timeoutMs?: number
    },
    confirm?: (payload: ShellConfirmPayload) => Promise<{ selected_ids: string[] }>,
  ): Promise<{
    ok: boolean
    exit_code: number | null
    stdout: string
    stderr: string
  }>
}

export interface ScheduleJobNotificationEvent {
  job: ScheduledJob
  run: ScheduledJobRun
  status: 'ok' | 'error'
  summary?: string | null
  error?: string | null
  session_id?: string | null
}

export type ScheduleJobNotificationHook = (
  event: ScheduleJobNotificationEvent,
) => void | Promise<void>

export interface JobRunnerDeps {
  agent: JobRunnerAgent
  shell: JobRunnerShell
  getSettings: () => ScheduleSettings
  assertShellArgv?: (argv: string[]) => void
  persistAgentSessionId?: (jobId: string, sessionId: string) => void | Promise<void>
  onComplete?: ScheduleJobNotificationHook
}

function truncateSummary(text: string, max = SUMMARY_MAX): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`
}

function isAgentPromptPayload(payload: ScheduledJob['payload']): payload is AgentPromptPayload {
  return typeof (payload as AgentPromptPayload).prompt === 'string'
}

function isShellScriptPayload(payload: ScheduledJob['payload']): payload is ShellScriptPayload {
  return Array.isArray((payload as ShellScriptPayload).argv)
}

function rejectShellWrapper(argv: string[]): void {
  const bin = argv[0]?.trim().toLowerCase() ?? ''
  if (['bash', 'sh', 'zsh', 'cmd', 'cmd.exe', 'powershell', 'pwsh'].includes(bin)) {
    throw new Error('计划任务不允许通过 shell 包装执行命令')
  }
  if (argv.some(arg => arg === '-c' || arg === '/c')) {
    throw new Error('计划任务不允许 bash -c 形式命令')
  }
}

function defaultAssertShellArgv(argv: string[]): void {
  if (!argv.length || !argv[0]?.trim()) {
    throw new Error('命令不能为空')
  }
  rejectShellWrapper(argv)
}

/** 计划任务无人值守：自动选择最宽松的非 cancel 确认项 */
async function scheduleShellConfirm(payload: ShellConfirmPayload): Promise<{ selected_ids: string[] }> {
  const preferIds = [
    'allow_session',
    'sticky',
    'allow_host_session',
    'allow_once',
    'once',
    'allow_host_once',
  ]
  for (const id of preferIds) {
    const hit = payload.options.find(o => o.id === id)
    if (hit) return { selected_ids: [hit.id] }
  }
  const fallback = payload.options.find(o => o.id !== 'cancel')
  if (fallback) return { selected_ids: [fallback.id] }
  return { selected_ids: ['cancel'] }
}

export class JobRunner {
  private readonly shellSessions = new Map<string, string>()

  constructor(private readonly deps: JobRunnerDeps) {}

  async execute(job: ScheduledJob, run: ScheduledJobRun): Promise<{
    summary?: string | null
    session_id?: string | null
  }> {
    try {
      const result = job.kind === 'shell_script'
        ? await this.runShellScript(job)
        : await this.runAgentPrompt(job)
      await this.deps.onComplete?.({
        job,
        run,
        status: 'ok',
        summary: result.summary ?? null,
        session_id: result.session_id ?? null,
      })
      return result
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await this.deps.onComplete?.({
        job,
        run,
        status: 'error',
        error: message,
      })
      throw e
    }
  }

  private async runAgentPrompt(job: ScheduledJob): Promise<{
    summary?: string | null
    session_id?: string | null
  }> {
    if (!isAgentPromptPayload(job.payload)) {
      throw new Error('任务载荷无效：缺少提示词')
    }
    if (this.deps.agent.llmConfigured === false) {
      throw new Error('尚未配置模型，无法执行智能体计划任务')
    }

    const prompt = job.payload.prompt.trim()
    if (!prompt) throw new Error('提示词不能为空')

    let sessionId = job.payload.session_id?.trim() || ''
    if (!sessionId) {
      const session = await this.deps.agent.createSession({
        title: `[计划] ${job.title}`,
        expertId: job.payload.expert_id?.trim() || undefined,
      })
      sessionId = session.id
    }

    const model = job.payload.model?.trim() || undefined
    const chat = await this.deps.agent.chat(sessionId, prompt, model)
    sessionId = chat.sessionId

    if (job.payload.session_id !== sessionId) {
      await this.deps.persistAgentSessionId?.(job.id, sessionId)
    }

    return {
      summary: truncateSummary(chat.reply),
      session_id: sessionId,
    }
  }

  private async runShellScript(job: ScheduledJob): Promise<{
    summary?: string | null
    session_id?: string | null
  }> {
    const settings = this.deps.getSettings()
    if (!settings.allow_shell_scripts) {
      throw new Error('尚未允许计划任务运行脚本，请先在设置中开启')
    }
    if (!isShellScriptPayload(job.payload)) {
      throw new Error('任务载荷无效：缺少脚本命令')
    }

    const argv = job.payload.argv.map(a => String(a))
    const assertArgv = this.deps.assertShellArgv ?? defaultAssertShellArgv
    assertArgv(argv)
    rejectShellWrapper(argv)

    let sessionId = this.shellSessions.get(job.id)
    if (!sessionId) {
      const session = await this.deps.agent.createSession({ title: `[计划脚本] ${job.title}` })
      sessionId = session.id
      this.shellSessions.set(job.id, sessionId)
    }

    const result = await this.deps.shell.run({
      sessionId,
      rootId: job.payload.root_id?.trim() || 'default',
      cwdRel: job.payload.cwd?.trim() || undefined,
      argv,
      timeoutMs: 120_000,
    }, scheduleShellConfirm)

    if (!result.ok) {
      const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
      throw new Error(detail || `命令退出码 ${result.exit_code ?? 'unknown'}`)
    }

    const summary = truncateSummary(
      [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
        || `退出码 ${result.exit_code ?? 0}`,
    )

    return { summary, session_id: sessionId }
  }
}

export function createJobExecutor(deps: JobRunnerDeps): JobExecutor {
  const runner = new JobRunner(deps)
  return (job, run) => runner.execute(job, run)
}
