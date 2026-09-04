/**
 * Wave 53A: HandsPort restricted shell.exec — fixed argv allowlist + execFile (no shell).
 * Does NOT use ShellRunner (free-form). win32 → unsupported_platform this wave.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'

export const HANDS_SHELL_EXEC_TIMEOUT_MS = 5_000
export const HANDS_SHELL_EXEC_MAX_STDOUT = 16 * 1024

/** Allowed bare command names (resolved to fixed absolute paths). */
export const HANDS_SHELL_ALLOWED_COMMANDS = ['uname', 'echo', 'pwd', 'date'] as const
export type HandsShellAllowedCommand = (typeof HANDS_SHELL_ALLOWED_COMMANDS)[number]

const ALLOWED = new Set<string>(HANDS_SHELL_ALLOWED_COMMANDS)

/** Prefer /bin then /usr/bin (macOS: echo/pwd/date live in /bin; uname in /usr/bin). */
const BINARY_CANDIDATES: Record<HandsShellAllowedCommand, readonly string[]> = {
  uname: ['/usr/bin/uname', '/bin/uname'],
  echo: ['/bin/echo', '/usr/bin/echo'],
  pwd: ['/bin/pwd', '/usr/bin/pwd'],
  date: ['/bin/date', '/usr/bin/date'],
}

/** Shell metacharacters / expansion — never acceptable in any argv element. */
const META_RE = /[|;&`$<>(){}\n\r\\]|\$\(/

/** echo literals: printable-safe, no meta (META_RE already applied). */
const ECHO_LITERAL_RE = /^[\w.+\-=:@%/, ]*$/

/** uname / date optional short flags only (e.g. -a, -s, -u). */
const SAFE_FLAG_RE = /^-[a-zA-Z]+$/

export class HandsShellDenialError extends Error {
  readonly denialCode: string

  constructor(denialCode: string, message: string) {
    super(message)
    this.name = 'HandsShellDenialError'
    this.denialCode = denialCode
  }
}

export type HandsRestrictedShellResult = {
  argv: string[]
  binary: string
  exitCode: number
  stdout: string
  stderr: string
  stdout_truncated: boolean
  stderr_truncated: boolean
  duration_ms: number
}

function resolveBinary(cmd: HandsShellAllowedCommand): string {
  for (const candidate of BINARY_CANDIDATES[cmd]) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`allowed binary not found for ${cmd}`)
}

function assertNoMeta(label: string, value: string): void {
  if (META_RE.test(value)) {
    throw new Error(`${label}: shell metacharacters not allowed`)
  }
}

function parseArgv(args: Record<string, unknown>): string[] {
  const raw = args.argv
  if (!Array.isArray(raw)) {
    throw new Error('argv required (string[])')
  }
  if (raw.length === 0) {
    throw new Error('argv must not be empty')
  }
  for (let i = 0; i < raw.length; i++) {
    const el = raw[i]
    if (typeof el !== 'string') {
      throw new Error(`argv[${i}] must be a string`)
    }
  }
  return raw as string[]
}

function validateArgv(argv: readonly string[]): {
  cmd: HandsShellAllowedCommand
  rest: string[]
} {
  const cmdRaw = argv[0] ?? ''
  assertNoMeta('argv[0]', cmdRaw)

  // Bare name only — no paths, no ./uname, no /bin/sh.
  if (cmdRaw.includes('/') || cmdRaw.includes('\\')) {
    throw new Error('argv[0] must be a bare allowlisted command name')
  }
  if (!ALLOWED.has(cmdRaw)) {
    throw new Error(`command not allowlisted: ${cmdRaw}`)
  }
  const cmd = cmdRaw as HandsShellAllowedCommand
  const rest = argv.slice(1)

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? ''
    assertNoMeta(`argv[${i + 1}]`, a)
  }

  switch (cmd) {
    case 'pwd':
      if (rest.length > 0) {
        throw new Error('pwd accepts no arguments')
      }
      break
    case 'uname':
      for (const a of rest) {
        if (!SAFE_FLAG_RE.test(a)) {
          throw new Error(`uname: unsafe arg: ${a}`)
        }
      }
      break
    case 'date':
      for (const a of rest) {
        if (!SAFE_FLAG_RE.test(a)) {
          throw new Error(`date: unsafe arg: ${a}`)
        }
      }
      break
    case 'echo':
      for (const a of rest) {
        if (!ECHO_LITERAL_RE.test(a)) {
          throw new Error(`echo: only literal args allowed`)
        }
      }
      break
    default: {
      const _exhaustive: never = cmd
      throw new Error(`unexpected command: ${_exhaustive}`)
    }
  }

  return { cmd, rest }
}

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  return { text: text.slice(0, max), truncated: true }
}

function runExecFile(
  binary: string,
  rest: readonly string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      [...rest],
      {
        timeout: HANDS_SHELL_EXEC_TIMEOUT_MS,
        maxBuffer: HANDS_SHELL_EXEC_MAX_STDOUT,
        encoding: 'utf8',
        shell: false,
        env: {
          PATH: '/usr/bin:/bin',
          LANG: 'C',
          LC_ALL: 'C',
        },
      },
      (err, stdout, stderr) => {
        const out = typeof stdout === 'string' ? stdout : String(stdout ?? '')
        const errOut = typeof stderr === 'string' ? stderr : String(stderr ?? '')

        if (!err) {
          resolve({ exitCode: 0, stdout: out, stderr: errOut })
          return
        }

        const nodeErr = err as NodeJS.ErrnoException & {
          killed?: boolean
          signal?: string | null
          code?: string | number | null
        }

        if (nodeErr.code === 'ENOENT') {
          reject(new Error(`binary not executable: ${binary}`))
          return
        }
        if (nodeErr.killed || nodeErr.signal === 'SIGTERM') {
          reject(new Error('command timed out'))
          return
        }
        // Non-zero exit: Node sets err.code to the numeric exit status.
        const exitCode =
          typeof nodeErr.code === 'number' ? nodeErr.code : 1
        resolve({ exitCode, stdout: out, stderr: errOut })
      },
    )
  })
}

/**
 * Execute a HandsPort restricted shell ticket.
 * Args shape: `{ argv: string[], sessionId?: string }` (sessionId ignored this wave).
 */
export async function executeRestrictedShell(
  args: Record<string, unknown>,
): Promise<HandsRestrictedShellResult> {
  if (process.platform === 'win32') {
    throw new HandsShellDenialError(
      'unsupported_platform',
      'hands.shell.exec is not supported on win32 in this wave',
    )
  }
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new HandsShellDenialError(
      'unsupported_platform',
      `hands.shell.exec unsupported on platform ${process.platform}`,
    )
  }

  const argv = parseArgv(args)
  const { cmd, rest } = validateArgv(argv)
  const binary = resolveBinary(cmd)
  const started = Date.now()
  const raw = await runExecFile(binary, rest)
  const out = truncate(raw.stdout, HANDS_SHELL_EXEC_MAX_STDOUT)
  const err = truncate(raw.stderr, HANDS_SHELL_EXEC_MAX_STDOUT)

  return {
    argv: [cmd, ...rest],
    binary,
    exitCode: raw.exitCode,
    stdout: out.text,
    stderr: err.text,
    stdout_truncated: out.truncated,
    stderr_truncated: err.truncated,
    duration_ms: Date.now() - started,
  }
}

export function isHandsShellDenial(err: unknown): err is HandsShellDenialError {
  if (err instanceof HandsShellDenialError) return true
  return (
    err instanceof Error
    && err.name === 'HandsShellDenialError'
    && typeof (err as HandsShellDenialError).denialCode === 'string'
  )
}
