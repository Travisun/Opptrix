/**
 * Win32 RestrictedToken spawn via optional `koffi`.
 * RestrictedToken（DISABLE_MAX_PRIVILEGE | LUA_TOKEN）+ CreateProcessAsUserW；
 * 不声称完整出站隔离。缺 koffi / API 失败时硬失败，禁止普通 spawn 冒充。
 */

import { promisify } from 'node:util'
import { WorkspaceError } from '../../errors.js'
import type { UnelevatedSpawnParams, UnelevatedSpawnResult } from './types.js'
import {
  allocStruct,
  getWinApis,
  logWinOpFailure,
  readLastError,
  tryLoadKoffi,
  type KoffiModule,
  type WinApis,
} from './win-apis.js'

/** 缺绑定组件 / 本机不支持 RestrictedToken 时 */
export const UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE =
  '基础隔离组件不可用，请改用完整隔离或稍后重试'

/** token / 管道 / 进程启动失败（非「组件缺失」） */
export const UNELEVATED_SPAWN_FAILED_MESSAGE =
  '基础隔离启动失败，请改用完整隔离或稍后重试'

/** 实现层异常（分配/绑定等），禁止伪装成「组件不可用」 */
export const UNELEVATED_INTERNAL_ERROR_MESSAGE =
  '基础隔离暂时无法使用，请改用完整隔离或稍后重试'

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
/** ERROR_BROKEN_PIPE / ERROR_PIPE_NOT_CONNECTED — 对端已关闭 */
const ERROR_BROKEN_PIPE = 109
const ERROR_PIPE_NOT_CONNECTED = 233

/** 成功探测可缓存；失败不永久缓存（避免 Duplicate 等实现错误锁死）。 */
let probeOkCached = false

function isInternalBindError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /Duplicate type name|Expected 2 arguments|alloc|koffi/i.test(msg)
}

function mapUnexpectedSpawnError(err: unknown): never {
  if (err instanceof WorkspaceError) throw err
  const msg = err instanceof Error ? err.message : String(err)
  console.debug('[windows-unelevated] unexpected spawn error:', msg)
  if (isInternalBindError(err)) {
    throw new WorkspaceError(UNELEVATED_INTERNAL_ERROR_MESSAGE)
  }
  throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
}

/**
 * 探测 RestrictedToken + CreateProcessAsUserW 是否可用。
 * 失败不抛错，供 status / isUnelevatedSpawnSupported 使用。
 * 实现错误记入 debug 日志，不永久缓存为 false。
 */
export function probeRestrictedTokenApi(): boolean {
  if (process.platform !== 'win32') return false
  if (probeOkCached) return true
  const koffi = tryLoadKoffi()
  if (!koffi) return false
  try {
    const api = getWinApis(koffi)
    const tokenOut = [null] as unknown[]
    if (!api.OpenProcessToken(api.GetCurrentProcess(), TOKEN_ACCESS, tokenOut)) {
      logWinOpFailure('OpenProcessToken', api)
      return false
    }
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
    if (!ok) {
      logWinOpFailure('CreateRestrictedToken', api)
      return false
    }
    api.CloseHandle(restrictedOut[0])
    void api.CreateProcessAsUserW
    probeOkCached = true
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.debug('[windows-unelevated] probe error (not cached as unsupported):', msg)
    // 不永久缓存失败；单例修复后重试可恢复
    return false
  }
}

/** @internal 测试用 */
export function resetUnelevatedProbeCacheForTests(): void {
  probeOkCached = false
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

function closeQuiet(CloseHandle: WinApis['CloseHandle'], handle: unknown): void {
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
    logWinOpFailure('CreatePipe', api)
    throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
  }
  return { read: readOut[0], write: writeOut[0] }
}

function setInherit(api: WinApis, handle: unknown, inherit: boolean): void {
  if (!api.SetHandleInformation(handle, HANDLE_FLAG_INHERIT, inherit ? HANDLE_FLAG_INHERIT : 0)) {
    logWinOpFailure('SetHandleInformation', api)
    throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
  }
}

function isPipeClosedError(code: number): boolean {
  return code === ERROR_BROKEN_PIPE || code === ERROR_PIPE_NOT_CONNECTED
}

/**
 * 经 Win32 ReadFile 排空匿名管道。
 * Windows 上 Node libuv fd 与 CRT 句柄不互通，故不经 node:fs 读管道。
 */
async function readPipeHandleToString(api: WinApis, handle: unknown): Promise<string> {
  const chunks: Buffer[] = []
  const buf = Buffer.alloc(8192)
  type ReadFileAsyncFn = (
    h: unknown,
    buffer: Buffer,
    len: number,
    readOut: number[],
    overlapped: null,
  ) => Promise<unknown>
  const readAsync: ReadFileAsyncFn | null =
    typeof api.ReadFile.async === 'function'
      ? (promisify(api.ReadFile.async.bind(api.ReadFile)) as ReadFileAsyncFn)
      : null

  while (true) {
    const availOut = [0]
    if (!api.PeekNamedPipe(handle, null, 0, null, availOut, null)) {
      const err = readLastError(api)
      if (isPipeClosedError(err)) break
      logWinOpFailure('PeekNamedPipe', api)
      throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
    }
    const avail = typeof availOut[0] === 'number' ? availOut[0] : 0
    if (avail > 0) {
      const readOut = [0]
      const nWant = Math.min(avail, buf.length)
      if (!api.ReadFile(handle, buf, nWant, readOut, null)) {
        const err = readLastError(api)
        if (isPipeClosedError(err)) break
        logWinOpFailure('ReadFile', api)
        throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
      }
      const n = typeof readOut[0] === 'number' ? readOut[0] : 0
      if (n > 0) chunks.push(Buffer.from(buf.subarray(0, n)))
      continue
    }

    // 管道空：异步阻塞读，避免堵死事件循环；写端关闭后返回失败或 0 字节
    const readOut = [0]
    let ok: unknown
    if (readAsync) {
      ok = await readAsync(handle, buf, buf.length, readOut, null)
    } else {
      ok = api.ReadFile(handle, buf, buf.length, readOut, null)
    }
    if (!ok) {
      const err = readLastError(api)
      if (isPipeClosedError(err)) break
      logWinOpFailure('ReadFile', api)
      throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
    }
    const n = typeof readOut[0] === 'number' ? readOut[0] : 0
    if (n === 0) break
    chunks.push(Buffer.from(buf.subarray(0, n)))
  }

  return Buffer.concat(chunks).toString('utf8')
}

/**
 * 主路径：koffi RestrictedToken + CreateProcessAsUserW。
 * 缺 koffi → 组件不可用；token/pipe/CreateProcess 失败 → 启动失败；实现错误 → 独立文案。
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
    mapUnexpectedSpawnError(err)
  }
}

async function spawnViaRestrictedToken(
  koffi: KoffiModule,
  params: UnelevatedSpawnParams,
): Promise<UnelevatedSpawnResult> {
  let api: WinApis
  try {
    api = getWinApis(koffi)
  } catch (err) {
    console.debug(
      '[windows-unelevated] bind failed:',
      err instanceof Error ? err.message : String(err),
    )
    throw new WorkspaceError(UNELEVATED_INTERNAL_ERROR_MESSAGE)
  }

  const baseOut = [null] as unknown[]
  if (!api.OpenProcessToken(api.GetCurrentProcess(), TOKEN_ACCESS, baseOut)) {
    logWinOpFailure('OpenProcessToken', api)
    throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
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
    logWinOpFailure('CreateRestrictedToken', api)
    throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
  }
  const restrictedToken = restrictedOut[0]

  let stdin: { read: unknown; write: unknown } | null = null
  let stdout: { read: unknown; write: unknown } | null = null
  let stderr: { read: unknown; write: unknown } | null = null
  let hProcess: unknown = null
  let hThread: unknown = null

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

    let piPtr: unknown
    try {
      piPtr = allocStruct(api.koffi, api.PROCESS_INFORMATION)
    } catch (err) {
      console.debug(
        '[windows-unelevated] alloc PROCESS_INFORMATION failed:',
        err instanceof Error ? err.message : String(err),
      )
      throw new WorkspaceError(UNELEVATED_INTERNAL_ERROR_MESSAGE)
    }

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
      logWinOpFailure('CreateProcessAsUserW', api)
      throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
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

    const stdoutHandle = stdout.read
    const stderrHandle = stderr.read
    stdout.read = null
    stderr.read = null

    const stdoutP = readPipeHandleToString(api, stdoutHandle)
    const stderrP = readPipeHandleToString(api, stderrHandle)

    try {
      const exitCode = await waitForProcess(api, hProcess, params.timeoutMs, params.signal)
      const [stdoutText, stderrText] = await Promise.all([stdoutP, stderrP])
      return { exitCode, stdout: stdoutText, stderr: stderrText }
    } finally {
      closeQuiet(api.CloseHandle, stdoutHandle)
      closeQuiet(api.CloseHandle, stderrHandle)
    }
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
        logWinOpFailure('WaitForSingleObject', api)
        throw new WorkspaceError(UNELEVATED_SPAWN_FAILED_MESSAGE)
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
