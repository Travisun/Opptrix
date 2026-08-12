/** Shared types for Windows unelevated spawn (avoid circular imports). */

export interface UnelevatedSpawnParams {
  argv: string[]
  env: NodeJS.ProcessEnv
  cwd: string
  timeoutMs: number
  signal?: AbortSignal
}

export interface UnelevatedSpawnResult {
  exitCode: number | null
  stdout: string
  stderr: string
}
