/**
 * Win32 API bindings via optional `koffi` — process-wide singleton.
 * struct / func 只绑定一次，避免 Duplicate type name。
 */

import { createRequire } from 'node:module'

export type KoffiFn = (...fnArgs: unknown[]) => unknown

export type KoffiLib = {
  func: (...args: unknown[]) => KoffiFn
}

export type KoffiModule = {
  load: (name: string) => KoffiLib
  struct: (name: string, def: Record<string, string>) => unknown
  sizeof: (type: unknown) => number
  /** koffi≥2.x 需要 length；旧版可能仅单参 */
  alloc: (type: unknown, length?: number) => unknown
  decode: (value: unknown, type: unknown) => unknown
}

export type WinApis = {
  koffi: KoffiModule
  GetCurrentProcess: KoffiFn
  CloseHandle: KoffiFn
  CreatePipe: KoffiFn
  SetHandleInformation: KoffiFn
  WaitForSingleObject: KoffiFn
  GetExitCodeProcess: KoffiFn
  TerminateProcess: KoffiFn
  GetLastError: KoffiFn
  ReadFile: KoffiFn & { async?: (...args: unknown[]) => unknown }
  PeekNamedPipe: KoffiFn
  OpenProcessToken: KoffiFn
  CreateRestrictedToken: KoffiFn
  CreateProcessAsUserW: KoffiFn
  STARTUPINFOW: unknown
  PROCESS_INFORMATION: unknown
  SECURITY_ATTRIBUTES: unknown
}

let cachedApis: WinApis | null = null

export function tryLoadKoffi(): KoffiModule | null {
  try {
    const require = createRequire(import.meta.url)
    return require('koffi') as KoffiModule
  } catch {
    return null
  }
}

/**
 * 分配单个 struct 实例。主路径 `alloc(type, 1)`；兼容旧单参 API。
 */
export function allocStruct(koffi: KoffiModule, type: unknown): unknown {
  try {
    return koffi.alloc(type, 1)
  } catch (primaryErr) {
    try {
      return koffi.alloc(type)
    } catch {
      throw primaryErr instanceof Error ? primaryErr : new Error(String(primaryErr))
    }
  }
}

function bindWinApis(koffi: KoffiModule): WinApis {
  const kernel32 = koffi.load('kernel32.dll')
  const advapi32 = koffi.load('advapi32.dll')

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
    GetLastError: kernel32.func('uint32 __stdcall GetLastError()'),
    ReadFile: kernel32.func(
      'bool __stdcall ReadFile(void *, void *, uint32, _Out_ uint32 *, void *)',
    ) as WinApis['ReadFile'],
    PeekNamedPipe: kernel32.func(
      'bool __stdcall PeekNamedPipe(void *, void *, uint32, _Out_ uint32 *, _Out_ uint32 *, _Out_ uint32 *)',
    ),
    OpenProcessToken: advapi32.func(
      'bool __stdcall OpenProcessToken(void *, uint32, _Out_ void **)',
    ),
    CreateRestrictedToken: advapi32.func(
      'bool __stdcall CreateRestrictedToken(void *, uint32, uint32, void *, uint32, void *, uint32, void *, _Out_ void **)',
    ),
    CreateProcessAsUserW: advapi32.func(
      'bool __stdcall CreateProcessAsUserW(void *, void *, void *, void *, void *, int32, uint32, void *, void *, STARTUPINFOW *, _Inout_ PROCESS_INFORMATION *)',
    ),
    STARTUPINFOW,
    PROCESS_INFORMATION,
    SECURITY_ATTRIBUTES,
  }
}

/** 进程内单例：重复调用安全，struct/func 只绑定一次。 */
export function getWinApis(koffi?: KoffiModule): WinApis {
  if (cachedApis) return cachedApis
  const mod = koffi ?? tryLoadKoffi()
  if (!mod) {
    throw new Error('koffi unavailable')
  }
  cachedApis = bindWinApis(mod)
  return cachedApis
}

export function readLastError(api: WinApis): number {
  try {
    const code = api.GetLastError()
    return typeof code === 'number' ? code : 0
  } catch {
    return 0
  }
}

/** 开发向诊断日志；不记录句柄等敏感值。 */
export function logWinOpFailure(op: string, api: WinApis): void {
  const code = readLastError(api)
  console.debug(`[windows-unelevated] ${op} failed (Windows error ${code})`)
}
