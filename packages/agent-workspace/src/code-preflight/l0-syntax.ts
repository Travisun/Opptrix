import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolvePythonRuntime } from '../python/resolve-python.js'
import { resolveNodeRuntime } from '../node/resolve-node.js'
import type { PreflightCheck, PreflightDiagnostic } from './types.js'
import { parseNodeSyntaxDiagnostic, parsePythonSyntaxDiagnostic, pushDiagnostic } from './diagnostics.js'
import { truncateOutput } from './l0-static.js'

const execFileAsync = promisify(execFile)

export const SYNTAX_TIMEOUT_MS = 15_000

const SYNTAX_FIRST_ONLY_HINT =
  '语法器通常仅报告首条语法错误；安装 ruff/biome 并保留 levels 含 l1 可一次汇总更多问题'

const PREFER_LINED_DIAGNOSTICS_HINT =
  '优先用带 line 的 diagnostics，经 workspace_replace_lines 按行号定点修改；无行号时再 workspace_read(numbered=true) 定位'

function pushCheck(
  checks: PreflightCheck[],
  id: string,
  status: PreflightCheck['status'],
  message: string,
): void {
  checks.push({ id, level: 'l0', status, message })
}

async function runExec(
  file: string,
  args: string[],
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {},
): Promise<{ ok: boolean; stdout: string; stderr: string; timedOut: boolean }> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout: opts.timeoutMs ?? SYNTAX_TIMEOUT_MS,
      maxBuffer: 512 * 1024,
      env: opts.env,
      signal: opts.signal,
      windowsHide: true,
    })
    return {
      ok: true,
      stdout: String(stdout ?? ''),
      stderr: String(stderr ?? ''),
      timedOut: false,
    }
  } catch (err: unknown) {
    const e = err as {
      killed?: boolean
      code?: string | number | null
      stdout?: string | Buffer
      stderr?: string | Buffer
      message?: string
    }
    const timedOut = e.killed === true || e.code === 'ETIMEDOUT'
    return {
      ok: false,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? e.message ?? ''),
      timedOut,
    }
  }
}

/** 探测 Node 是否支持 --experimental-strip-types / --check 对 .ts */
export async function nodeSupportsStripTypes(nodePath: string, signal?: AbortSignal): Promise<boolean> {
  const probe = await runExec(nodePath, ['--experimental-strip-types', '-e', '0'], {
    timeoutMs: 5000,
    signal,
  })
  return probe.ok
}

export async function checkPythonSyntax(
  absPath: string,
  checks: PreflightCheck[],
  fixHints: string[],
  signal?: AbortSignal,
  diagnostics: PreflightDiagnostic[] = [],
): Promise<void> {
  let runtime
  try {
    runtime = await resolvePythonRuntime()
  } catch {
    pushCheck(checks, 'l0_python_syntax', 'skip', '无法探测 Python 运行时，已跳过语法检查')
    fixHints.push('请先调用 ensure_python，确认 Python 就绪后再检查语法')
    return
  }
  if (!runtime.ready || !runtime.active_path) {
    pushCheck(checks, 'l0_python_syntax', 'skip', 'Python 尚未就绪，已跳过语法检查')
    fixHints.push('请先调用 ensure_python，就绪后再跑 code_preflight 语法检查')
    return
  }
  const result = await runExec(runtime.active_path, ['-m', 'py_compile', absPath], { signal })
  if (result.timedOut) {
    pushCheck(checks, 'l0_python_syntax', 'fail', 'Python 语法检查超时')
    pushDiagnostic(diagnostics, {
      id: 'l0_python_syntax',
      level: 'l0',
      severity: 'error',
      message: 'Python 语法检查超时',
    })
    fixHints.push('请简化脚本或拆分文件后重试 code_preflight')
    return
  }
  if (result.ok) {
    pushCheck(checks, 'l0_python_syntax', 'pass', 'Python 语法检查通过')
    return
  }
  const raw = result.stderr || result.stdout || '语法错误'
  const diag = parsePythonSyntaxDiagnostic(raw)
  pushDiagnostic(diagnostics, diag)
  pushCheck(checks, 'l0_python_syntax', 'fail', diag.message)
  fixHints.push('请根据语法错误修正脚本后再次 code_preflight')
  fixHints.push(SYNTAX_FIRST_ONLY_HINT)
  if (typeof diag.line !== 'number') {
    fixHints.push(PREFER_LINED_DIAGNOSTICS_HINT)
  } else {
    fixHints.push('按 diagnostics.line 用 workspace_replace_lines 定点修改后再次 code_preflight')
  }
}

export async function checkJsTsSyntax(
  absPath: string,
  kind: 'javascript' | 'typescript' | 'tsx',
  checks: PreflightCheck[],
  fixHints: string[],
  signal?: AbortSignal,
  diagnostics: PreflightDiagnostic[] = [],
): Promise<void> {
  let runtime
  try {
    runtime = await resolveNodeRuntime()
  } catch {
    pushCheck(checks, 'l0_js_syntax', 'skip', '无法探测 Node 运行时，已跳过语法检查')
    fixHints.push('请先 get_system_info 确认 node_ready 后再检查语法')
    return
  }
  if (!runtime.ready || !runtime.active_path) {
    pushCheck(checks, 'l0_js_syntax', 'skip', 'Node 尚未就绪，已跳过语法检查')
    fixHints.push('请先 get_system_info 确认 node_ready 后再检查语法')
    return
  }

  const env: NodeJS.ProcessEnv = { ...process.env }
  if (runtime.electron_run_as_node) {
    env.ELECTRON_RUN_AS_NODE = '1'
  }

  if (kind === 'tsx') {
    pushCheck(
      checks,
      'l0_js_syntax',
      'skip',
      '当前为 .tsx，内置语法检查仅尽力支持 .js/.mjs/.cjs/.ts；可改用 .js 或仅依赖平台规则',
    )
    fixHints.push('建议先用 .js/.mjs 编写可运行脚本，或仅依赖 L0 平台规则后再 opptrix_run')
    return
  }

  const args: string[] = ['--check']
  if (kind === 'typescript') {
    const strip = await nodeSupportsStripTypes(runtime.active_path, signal)
    if (!strip) {
      pushCheck(
        checks,
        'l0_js_syntax',
        'skip',
        '当前 Node 不支持 strip-types，已跳过 .ts 语法检查',
      )
      fixHints.push('请先用 .js/.mjs，或仅依赖 L0 平台规则；需要类型检查可安装 @biomejs/biome 后开 L1')
      return
    }
    args.unshift('--experimental-strip-types')
  }
  args.push(absPath)

  const result = await runExec(runtime.active_path, args, { env, signal })
  if (result.timedOut) {
    pushCheck(checks, 'l0_js_syntax', 'fail', 'JavaScript/TypeScript 语法检查超时')
    pushDiagnostic(diagnostics, {
      id: 'l0_js_syntax',
      level: 'l0',
      severity: 'error',
      message: 'JavaScript/TypeScript 语法检查超时',
    })
    fixHints.push('请简化脚本后重试 code_preflight')
    return
  }
  if (result.ok) {
    pushCheck(checks, 'l0_js_syntax', 'pass', 'JavaScript/TypeScript 语法检查通过')
    return
  }
  const raw = result.stderr || result.stdout || '语法错误'
  const diag = parseNodeSyntaxDiagnostic(raw)
  pushDiagnostic(diagnostics, diag)
  pushCheck(checks, 'l0_js_syntax', 'fail', diag.message || truncateOutput(raw, 200))
  fixHints.push('请根据语法错误修正脚本后再次 code_preflight')
  fixHints.push(SYNTAX_FIRST_ONLY_HINT)
  if (typeof diag.line !== 'number') {
    fixHints.push(PREFER_LINED_DIAGNOSTICS_HINT)
  } else {
    fixHints.push('按 diagnostics.line 用 workspace_replace_lines 定点修改后再次 code_preflight')
  }
}
