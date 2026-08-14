/** code_preflight 结构化结果（相对 path；勿向用户文案泄露绝对路径） */

export type PreflightLevel = 'l0' | 'l1'

export type PreflightCheckStatus = 'pass' | 'fail' | 'skip' | 'warn'

export type PreflightLanguage = 'python' | 'javascript' | 'typescript'

export type PreflightDiagnosticSeverity = 'error' | 'warning'

export interface PreflightCheck {
  id: string
  level: PreflightLevel
  status: PreflightCheckStatus
  message: string
}

/** 单条可修复问题（一轮尽量列全；勿把多问题糊成一行） */
export interface PreflightDiagnostic {
  id: string
  level: PreflightLevel
  severity: PreflightDiagnosticSeverity
  message: string
  line?: number
  column?: number
  code?: string
}

export interface CodePreflightResult {
  ok: boolean
  path: string
  language: PreflightLanguage | null
  checks: PreflightCheck[]
  /** 细节以本数组为准；errors/warnings 由其派生 */
  diagnostics: PreflightDiagnostic[]
  errors: string[]
  warnings: string[]
  fix_hints: string[]
  l1_available: { ruff?: boolean; biome?: boolean }
}

export type PreflightLanguageOpt = 'auto' | PreflightLanguage

export type PreflightLevelsOpt = readonly PreflightLevel[]

export interface CodePreflightParams {
  sessionId: string
  rootId: string
  path: string
  language?: PreflightLanguageOpt
  levels?: PreflightLevelsOpt
  signal?: AbortSignal
}
