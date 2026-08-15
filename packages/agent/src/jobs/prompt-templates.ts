import type { BackgroundJobKind } from './constants.js'

const TEMPLATES: Record<BackgroundJobKind, (jobId: string) => string> = {
  'python-install': (jobId) =>
    `检查 ensure_python（job_id=${jobId}）是否就绪；若 ready 则继续原计划，失败则说明原因并给出下一步。勿 tight-poll。`,
  'fuyao-dump': (jobId) =>
    `检查 prepare_fuyao_dump（job_id=${jobId}）是否就绪；若 ready 使用返回 path 继续，失败则说明原因。勿 force_refresh、勿 tight-poll。`,
  'shell-command': (jobId) =>
    `检查后台命令（job_id=${jobId}）是否结束；若 completed 根据结果继续原计划，失败/取消则说明原因。勿 tight-poll。`,
}

const TOOL_KIND: Record<string, BackgroundJobKind> = {
  ensure_python: 'python-install',
  prepare_fuyao_dump: 'fuyao-dump',
  // opptrix_run 仅 background 返回带 kind/job_id；见 result.kind / resolveJobKindFromJobId
}

export function resolveJobKindFromTool(toolName: string): BackgroundJobKind | null {
  return TOOL_KIND[toolName.trim()] ?? null
}

export function resolveJobKindFromJobId(jobId: string): BackgroundJobKind | null {
  const id = jobId.trim()
  if (id === 'python-install' || id.startsWith('python-')) return 'python-install'
  if (id.startsWith('shell-')) return 'shell-command'
  // fuyao dump 使用 UUID；无法仅靠 id 判断
  return null
}

export function buildDefaultResumePrompt(
  kind: BackgroundJobKind,
  jobId: string,
): string {
  const fn = TEMPLATES[kind]
  return fn(jobId)
}

export function userFacingJobLabel(
  kind: BackgroundJobKind,
  message?: string,
): string {
  if (message?.trim()) return message.trim()
  if (kind === 'python-install') return '正在准备运行环境…'
  if (kind === 'fuyao-dump') return '正在准备数据包…'
  if (kind === 'shell-command') return '正在执行命令…'
  return '后台任务进行中…'
}
