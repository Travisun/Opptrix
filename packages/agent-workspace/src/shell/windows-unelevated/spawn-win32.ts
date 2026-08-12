/**
 * Win32 RestrictedToken spawn via optional `koffi`.
 * RestrictedToken（DISABLE_MAX_PRIVILEGE | LUA_TOKEN）+ CreateProcessAsUserW；
 * 不声称完整出站隔离。缺 koffi / API 失败时硬失败，禁止普通 spawn 冒充。
 */

import { createRequire } from 'node:module'
import { closeSync, createReadStream } from 'node:fs'
import { WorkspaceError } from '../../errors.js'
import type { UnelevatedSpawnParams, UnelevatedSpawnResult } from './types.js'

export const UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE =
  '基础隔离组件不可用，请改用完整隔离或稍后重试'

const DISABLE_MAX_PRIVILEGE = 0x1
const LUA_TOKEN = 0x4
const TOKEN_DUPLICATE = 0x0002
const TOKEN_QUERY = 0x0008
const TOKEN_ASSIGN_PRIMARY = 0x0001
const TOKEN_ADJUST_DEFAULT = 0x0080
const TOKEN_ADJUST_SESSIONID = 0x0100
const TOKEN_ACCESS =
  TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ASSIGN_PRIMARY | TOKEN_ADJUST_DEFAULT | TOKEN_ADJUST_SESSIONID

const HANDLE_FLAG_INHERIT = 0x00000001
const STARTF_USESTDHANDLES = 0x00000100
const CREATE_UNICODE_ENVIRONMENT = 0x00000400
const CREATE_NO_WINDOW = 0x08000000
const WAIT_OBJECT_0 = 0
const WAIT_TIMEOUT = 0x00000102

type KoffiFn = ((...fnArgs: unknown[]) => unknown)

type KoffiLib = {
  func: (...args: unknown[]) => KoffiFn
}

type KoffiModule = {
  load: (name: string) => KoffiLib
  struct: (name: string, def: Record<string, string>) => unknown
  sizeof: (type: unknown) => number
  alloc: (type: unknown) => unknown
  decode: (value: unknown, type: unknown) => unknown
}

type WinApis = {
  koffi: KoffiModule
  GetCurrentProcess: KoffiFn
  CloseHandle: KoffiFn
  CreatePipe: KoffiFn
  SetHandleInformation: KoffiFn
  WaitForSingleObject: KoffiFn
  GetExitCodeProcess: KoffiFn
  TerminateProcess: KoffiFn
  OpenProcessToken: KoffiFn
  CreateRestrictedToken: KoffiFn
  CreateProcessAsUserW: KoffiFn
  OpenOsfHandle: KoffiFn
  STARTUPINFOW: unknown
  PROCESS_INFORMATION: unknown
  SECURITY_ATTRIBUTES: unknown
}

function tryLoadKoffi(): KoffiModule | null {
  try {
    const require = createRequire(import.meta.url)
    return require('koffi') as KoffiModule
  } catch {
    return null
  }
}

function loadWinApis(koffi: KoffiModule): WinApis {
  const kernel32 = koffi.load('kernel32.dll')
  const advapi32 = koffi.load('advapi32.dll')
  let OpenOsfHandle: KoffiFn
  try {
    OpenOsfHandle = koffi.load('ucrtbase.dll').func('int __cdecl _open_osfhandle(void *, int)')
  } catch {
    OpenOsfHandle = koffi.load('msvcrt.dll').func('int __cdecl _open_osfhandle(void *, int)')
  }

  const SECURITY_ATTRIBUTES = koffi.struct('SECURITY_ATTRIBUTES', {
    nLength: 'uint32',
    lpSecurityDescriptor: 'void *',
    bInheritHandle: 'int32',
  })
  const STARTUPINFOW = koffi.struct('STARTUPINFOW', {
    cb: 'uint32',
    lpReserved: 'void *',
    lpDesktop: 'void *',
    lpTitle: 'void *',
    dwX: 'uint32',
    dwY: 'uint32',
    dwXSize: 'uint32',
    dwYSize: 'uint32',
    dwXCountChars: 'uint32',
    dwYCountChars: 'uint32',
    dwFillAttribute: 'uint32',
    dwFlags: 'uint32',
    wShowWindow: 'uint16',
    cbReserved2: 'uint16',
    lpReserved2: 'void *',
    hStdInput: 'void *',
    hStdOutput: 'void *',
    hStdError: 'void *',
  })
  const PROCESS_INFORMATION = koffi.struct('PROCESS_INFORMATION', {
    hProcess: 'void *',
    hThread: 'void *',
    dwProcessId: 'uint32',
    dwThreadId: 'uint32',
  })

  return {
    koffi,
    GetCurrentProcess: kernel32.func('void * __stdcall GetCurrentProcess()'),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *)'),
    CreatePipe: kernel32.func(
      'bool __stdcall CreatePipe(_Out_ void **, _Out_ void **, SECURITY_ATTRIBUTES *, uint32)',
    ),
    SetHandleInformation: kernel32.func(
      'bool __stdcall SetHandleInformation(void *, uint32, uint32)',
    ),
    WaitForSingleObject: kernel32.func(
      'uint32 __stdcall WaitForSingleObject(void *, uint32)',
    ),
    GetExitCodeProcess: kernel32.func(
      'bool __stdcall GetExitCodeProcess(void *, _Out_ uint32 *)',
    ),
    TerminateProcess: kernel32.func('bool __stdcall TerminateProcess(void *, uint32)'),
    OpenProcessToken: advapi32.func(
      'bool __stdcall OpenProcessToken(void *, uint32, _Out_ void **)',
    ),
    CreateRestrictedToken: advapi32.func(
      'bool __stdcall CreateRestrictedToken(void *, uint32, uint32, void *, uint32, void *, uint32, void *, _Out_ void **)',
    ),
    CreateProcessAsUserW: advapi32.func(
      'bool __stdcall CreateProcessAsUserW(void *, void *, void *, void *, void *, int32, uint32, void *, void *, STARTUPINFOW *, _Inout_ PROCESS_INFORMATION *)',
    ),
    OpenOsfHandle,
    STARTUPINFOW,
    PROCESS_INFORMATION,
    SECURITY_ATTRIBUTES,
  }
}

/**
 * 探测 RestrictedToken + CreateProcessAsUserW 是否可用。
 * 失败不抛错，供 status / isUnelevatedSpawnSupported 使用。
 */
export function probeRestrictedTokenApi(): boolean {
  if (process.platform !== 'win32') return false
  const koffi = tryLoadKoffi()
  if (!koffi) return false
  try {
    const api = loadWinApis(koffi)
    const tokenOut = [null] as unknown[]
    if (!api.OpenProcessToken(api.GetCurrentProcess(), TOKEN_ACCESS, tokenOut)) return false
    const base = tokenOut[0]
    const restrictedOut = [null] as unknown[]
    const ok = api.CreateRestrictedToken(
      base,
      DISABLE_MAX_PRIVILEGE | LUA_TOKEN,
      0,
      null,
      0,
      null,
      0,
      null,
      restrictedOut,
    )
    api.CloseHandle(base)
    if (!ok) return false
    api.CloseHandle(restrictedOut[0])
    void api.CreateProcessAsUserW
    return true
  } catch {
    return false
  }
}

/** Quote a single Windows command-line argument (CommandLineToArgvW / CRT rules). */
export function quoteWindowsArg(arg: string): string {
  const needsQuotes = arg.length === 0 || /[ \t\n\r"]/.test(arg)
  if (!needsQuotes) return arg

  let quoted = '"'
  let backslashes = 0
  for (const ch of arg) {
    if (ch === '\\') {
      backslashes += 1
      continue
    }
    if (ch === '"') {
      quoted += '\\'.repeat(backslashes * 2 + 1) + '"'
      backslashes = 0
      continue
    }
    if (backslashes > 0) {
      quoted += '\\'.repeat(backslashes)
      backslashes = 0
    }
    quoted += ch
  }
  if (backslashes > 0) quoted += '\\'.repeat(backslashes * 2)
  quoted += '"'
  return quoted
}

export function argvToCommandLine(argv: string[]): string {
  return argv.map(quoteWindowsArg).join(' ')
}

function makeEnvBlock(env: NodeJS.ProcessEnv): Buffer {
  const items: string[] = []
  for (const [k, v] of Object.entries(env)) {
    if (v == null) continue
    items.push(`${k}=${v}`)
  }
  items.sort((a, b) => a.toUpperCase().localeCompare(b.toUpperCase()) || a.localeCompare(b))
  return Buffer.from(`${items.join('\0')}\0\0`, 'utf16le')
}

function toWideBuffer(s: string): Buffer {
  return Buffer.from(`${s}\0`, 'utf16le')
}

function closeQuiet(CloseHandle: KoffiFn, handle: unknown): void {
  if (handle == null) return
  try {
    CloseHandle(handle)
  } catch {
    /* ignore */
  }
}

function createInheritablePipe(api: WinApis): { read: unknown; write: unknown } {
  const sa = {
    nLength: api.koffi.sizeof(api.SECURITY_ATTRIBUTES),
    lpSecurityDescriptor: null,
    bInheritHandle: 1,
  }
  const readOut = [null] as unknown[]
  const writeOut = [null] as unknown[]
  if (!api.CreatePipe(readOut, writeOut, sa, 0)) {
    throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
  }
  return { read: readOut[0], write: writeOut[0] }
}

function setInherit(api: WinApis, handle: unknown, inherit: boolean): void {
  if (!api.SetHandleInformation(handle, HANDLE_FLAG_INHERIT, inherit ? HANDLE_FLAG_INHERIT : 0)) {
    throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
  }
}

function handleToFd(api: WinApis, handle: unknown): number {
  const fd = api.OpenOsfHandle(handle, 0) as number
  if (typeof fd !== 'number' || fd < 0) {
    throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
  }
  return fd
}

function readFdToString(fd: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = createReadStream('', { fd, autoClose: true })
    stream.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

/**
 * 主路径：koffi RestrictedToken + CreateProcessAsUserW。
 * 缺 koffi 或 API 失败 → 硬失败（禁止普通 spawn 冒充隔离）。
 */
export async function spawnUnelevatedRestrictedWin32(
  params: UnelevatedSpawnParams,
): Promise<UnelevatedSpawnResult> {
  if (!params.argv.length) {
    throw new WorkspaceError('沙箱命令为空')
  }

  const koffi = tryLoadKoffi()
  if (!koffi) {
    throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
  }

  try {
    return await spawnViaRestrictedToken(koffi, params)
  } catch (err) {
    if (err instanceof WorkspaceError) throw err
    throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
  }
}

async function spawnViaRestrictedToken(
  koffi: KoffiModule,
  params: UnelevatedSpawnParams,
): Promise<UnelevatedSpawnResult> {
  const api = loadWinApis(koffi)

  const baseOut = [null] as unknown[]
  if (!api.OpenProcessToken(api.GetCurrentProcess(), TOKEN_ACCESS, baseOut)) {
    throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
  }
  const baseToken = baseOut[0]

  const restrictedOut = [null] as unknown[]
  const tokenOk = api.CreateRestrictedToken(
    baseToken,
    DISABLE_MAX_PRIVILEGE | LUA_TOKEN,
    0,
    null,
    0,
    null,
    0,
    null,
    restrictedOut,
  )
  closeQuiet(api.CloseHandle, baseToken)
  if (!tokenOk) {
    throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
  }
  const restrictedToken = restrictedOut[0]

  let stdin: { read: unknown; write: unknown } | null = null
  let stdout: { read: unknown; write: unknown } | null = null
  let stderr: { read: unknown; write: unknown } | null = null
  let hProcess: unknown = null
  let hThread: unknown = null
  let stdoutFd = -1
  let stderrFd = -1

  try {
    stdin = createInheritablePipe(api)
    stdout = createInheritablePipe(api)
    stderr = createInheritablePipe(api)

    setInherit(api, stdin.write, false)
    setInherit(api, stdout.read, false)
    setInherit(api, stderr.read, false)
    setInherit(api, stdin.read, true)
    setInherit(api, stdout.write, true)
    setInherit(api, stderr.write, true)

    const cmdline = toWideBuffer(argvToCommandLine(params.argv))
    const envBlock = makeEnvBlock(params.env)
    const cwdWide = toWideBuffer(params.cwd)

    const si = {
      cb: api.koffi.sizeof(api.STARTUPINFOW),
      lpReserved: null,
      lpDesktop: null,
      lpTitle: null,
      dwX: 0,
      dwY: 0,
      dwXSize: 0,
      dwYSize: 0,
      dwXCountChars: 0,
      dwYCountChars: 0,
      dwFillAttribute: 0,
      dwFlags: STARTF_USESTDHANDLES,
      wShowWindow: 0,
      cbReserved2: 0,
      lpReserved2: null,
      hStdInput: stdin.read,
      hStdOutput: stdout.write,
      hStdError: stderr.write,
    }
    const piPtr = api.koffi.alloc(api.PROCESS_INFORMATION)
    const created = api.CreateProcessAsUserW(
      restrictedToken,
      null,
      cmdline,
      null,
      null,
      1,
      CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
      envBlock,
      cwdWide,
      si,
      piPtr,
    )
    if (!created) {
      throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
    }
    const pi = api.koffi.decode(piPtr, api.PROCESS_INFORMATION) as {
      hProcess: unknown
      hThread: unknown
    }
    hProcess = pi.hProcess
    hThread = pi.hThread

    closeQuiet(api.CloseHandle, stdin.read)
    closeQuiet(api.CloseHandle, stdout.write)
    closeQuiet(api.CloseHandle, stderr.write)
    stdin.read = null
    stdout.write = null
    stderr.write = null

    closeQuiet(api.CloseHandle, stdin.write)
    stdin.write = null

    stdoutFd = handleToFd(api, stdout.read)
    stdout.read = null
    stderrFd = handleToFd(api, stderr.read)
    stderr.read = null

    const stdoutP = readFdToString(stdoutFd)
    stdoutFd = -1
    const stderrP = readFdToString(stderrFd)
    stderrFd = -1

    const exitCode = await waitForProcess(api, hProcess, params.timeoutMs, params.signal)
    const [stdoutText, stderrText] = await Promise.all([stdoutP, stderrP])

    return { exitCode, stdout: stdoutText, stderr: stderrText }
  } finally {
    closeQuiet(api.CloseHandle, restrictedToken)
    if (stdin) {
      closeQuiet(api.CloseHandle, stdin.read)
      closeQuiet(api.CloseHandle, stdin.write)
    }
    if (stdout) {
      closeQuiet(api.CloseHandle, stdout.read)
      closeQuiet(api.CloseHandle, stdout.write)
    }
    if (stderr) {
      closeQuiet(api.CloseHandle, stderr.read)
      closeQuiet(api.CloseHandle, stderr.write)
    }
    if (stdoutFd >= 0) {
      try {
        closeSync(stdoutFd)
      } catch {
        /* ignore */
      }
    }
    if (stderrFd >= 0) {
      try {
        closeSync(stderrFd)
      } catch {
        /* ignore */
      }
    }
    closeQuiet(api.CloseHandle, hThread)
    closeQuiet(api.CloseHandle, hProcess)
  }
}

async function waitForProcess(
  api: WinApis,
  hProcess: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<number | null> {
  const deadline = Date.now() + Math.max(1, timeoutMs)
  let terminated = false

  const terminate = () => {
    if (terminated) return
    terminated = true
    try {
      api.TerminateProcess(hProcess, 1)
    } catch {
      /* ignore */
    }
  }

  const onAbort = () => terminate()
  if (signal) {
    if (signal.aborted) terminate()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    while (true) {
      if (terminated) {
        api.WaitForSingleObject(hProcess, 5_000)
        break
      }
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        terminate()
        api.WaitForSingleObject(hProcess, 5_000)
        break
      }
      const slice = Math.min(remaining, 200)
      const wr = api.WaitForSingleObject(hProcess, slice) as number
      if (wr === WAIT_OBJECT_0) break
      if (wr !== WAIT_TIMEOUT) {
        throw new WorkspaceError(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
      }
      await new Promise<void>(r => setTimeout(r, 0))
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
  }

  const codeOut = [0]
  if (!api.GetExitCodeProcess(hProcess, codeOut)) {
    return terminated ? 1 : null
  }
  return typeof codeOut[0] === 'number' ? codeOut[0] : null
}
