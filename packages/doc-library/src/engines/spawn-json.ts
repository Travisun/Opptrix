/**
 * 侧车：stdin 写一行 JSON，读 stdout 一行 JSON；超时 kill。
 * 不向 renderer 暴露任意命令。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export type SpawnJsonResult = {
  ok: boolean
  data: unknown
  stderr: string
  timedOut: boolean
  exitCode: number | null
}

export async function spawnJsonLine(opts: {
  command: string
  args: string[]
  request: unknown
  timeoutMs: number
  cwd?: string
  env?: NodeJS.ProcessEnv
}): Promise<SpawnJsonResult> {
  const timeoutMs = Math.max(1_000, opts.timeoutMs)

  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(opts.command, opts.args, {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      resolve({
        ok: false,
        data: { error: err instanceof Error ? err.message : String(err) },
        stderr: '',
        timedOut: false,
        exitCode: null,
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const finish = (payload: SpawnJsonResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(payload)
    }

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      finish({
        ok: false,
        data: { error: err.message },
        stderr,
        timedOut,
        exitCode: null,
      })
    })
    child.on('close', (code) => {
      const line = stdout
        .split('\n')
        .map(s => s.trim())
        .find(Boolean)
      if (!line) {
        finish({
          ok: false,
          data: { error: timedOut ? '整理超时' : (stderr.trim() || '侧车无输出') },
          stderr,
          timedOut,
          exitCode: code,
        })
        return
      }
      try {
        const data: unknown = JSON.parse(line)
        finish({
          ok: code === 0 || (typeof data === 'object' && data !== null && 'ok' in data),
          data,
          stderr,
          timedOut,
          exitCode: code,
        })
      } catch {
        finish({
          ok: false,
          data: { error: '侧车响应无效' },
          stderr,
          timedOut,
          exitCode: code,
        })
      }
    })

    try {
      child.stdin.write(`${JSON.stringify(opts.request)}\n`)
      child.stdin.end()
    } catch (err) {
      finish({
        ok: false,
        data: { error: err instanceof Error ? err.message : String(err) },
        stderr,
        timedOut: false,
        exitCode: null,
      })
    }
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
