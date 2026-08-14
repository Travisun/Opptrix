import type {
  CodePreflightResult,
  PreflightCheck,
  PreflightDiagnostic,
  PreflightLanguageOpt,
  PreflightLevel,
  PreflightLevelsOpt,
} from './types.js'
import { detectLanguageFromPath, looksLikeScriptContent } from './language.js'
import { checkEncoding, checkNewlines, checkPlatformPathRules } from './l0-static.js'
import { checkJsTsSyntax, checkPythonSyntax } from './l0-syntax.js'
import { detectL1Tools, runL1Checks } from './l1-tools.js'
import { finalizeDiagnostics, summarizeDiagnostics } from './diagnostics.js'

export const DEFAULT_PREFLIGHT_LEVELS: readonly PreflightLevel[] = ['l0', 'l1']

export interface RunCodePreflightInput {
  /** 相对路径（返回用） */
  path: string
  /** 绝对路径（仅内部 spawn / 读文件后已有内容） */
  absPath: string
  /** grant 根绝对路径（探测本地 bin） */
  grantRootAbs: string
  buf: Buffer
  language?: PreflightLanguageOpt
  levels?: PreflightLevelsOpt
  signal?: AbortSignal
  /** 文件是否存在且为文件（调用方已 gate）；false → 仅返回 fail */
  fileOk: boolean
  missing?: boolean
  notFile?: boolean
}

function buildResult(
  partial: Omit<CodePreflightResult, 'diagnostics' | 'errors' | 'warnings' | 'ok'> & {
    diagnostics: PreflightDiagnostic[]
  },
): CodePreflightResult {
  const diagnostics = finalizeDiagnostics(partial.diagnostics)
  const sum = summarizeDiagnostics(diagnostics)
  return {
    ...partial,
    ok: sum.ok,
    diagnostics,
    errors: sum.errors,
    warnings: sum.warnings,
  }
}

/**
 * 纯编排：调用方负责 path gate + 读文件。
 * 不执行用户业务代码；仅 compile/check + 静态扫描。
 * 非空可读文本：L0 静态 + 语法 + L1（若在 levels）全部跑完再汇总；不因单项 fail 跳过其余。
 */
export async function runCodePreflight(input: RunCodePreflightInput): Promise<CodePreflightResult> {
  const levels: PreflightLevel[] = input.levels?.length
    ? [...input.levels]
    : [...DEFAULT_PREFLIGHT_LEVELS]
  const wantL0 = levels.includes('l0')
  const wantL1 = levels.includes('l1')
  const checks: PreflightCheck[] = []
  const diagnostics: PreflightDiagnostic[] = []
  const fixHints: string[] = []

  const detected = detectLanguageFromPath(input.path, input.language ?? 'auto')
  const l1_available: CodePreflightResult['l1_available'] = {}

  if (!input.fileOk) {
    const msg = input.notFile ? '路径不是文件' : '文件不存在或不可读'
    checks.push({
      id: 'l0_exists',
      level: 'l0',
      status: 'fail',
      message: msg,
    })
    diagnostics.push({
      id: 'l0_exists',
      level: 'l0',
      severity: 'error',
      message: msg,
    })
    fixHints.push('请确认相对路径正确，且文件已用 workspace_write 写出')
    return buildResult({
      path: input.path,
      language: detected.language,
      checks,
      diagnostics,
      fix_hints: [...new Set(fixHints)],
      l1_available,
    })
  }

  checks.push({
    id: 'l0_exists',
    level: 'l0',
    status: 'pass',
    message: '文件存在且在授权工作区内可读',
  })

  const content = input.buf.toString('utf8')

  let skipTextScan = false
  if (wantL0) {
    checkEncoding(input.buf, checks, diagnostics)
    skipTextScan = checks.some(
      c => (c.id === 'l0_empty' || c.id === 'l0_encoding_nul') && c.status === 'fail',
    )
    if (!skipTextScan) {
      checkNewlines(content, checks, diagnostics)
      if (looksLikeScriptContent(input.path, content) || detected.syntaxKind !== 'unknown') {
        checkPlatformPathRules(content, checks, diagnostics)
      } else {
        checks.push({
          id: 'l0_platform_rules',
          level: 'l0',
          status: 'skip',
          message: '扩展名未知且无 shebang，已跳过平台路径扫描',
        })
      }

      if (detected.syntaxKind === 'python') {
        await checkPythonSyntax(input.absPath, checks, fixHints, input.signal, diagnostics)
      } else if (
        detected.syntaxKind === 'javascript'
        || detected.syntaxKind === 'typescript'
        || detected.syntaxKind === 'tsx'
      ) {
        await checkJsTsSyntax(
          input.absPath,
          detected.syntaxKind,
          checks,
          fixHints,
          input.signal,
          diagnostics,
        )
      } else {
        checks.push({
          id: 'l0_syntax',
          level: 'l0',
          status: 'skip',
          message: '未知扩展名，已跳过语法检查（仍可能已跑平台规则）',
        })
      }
    } else {
      fixHints.push('请写入非空脚本内容后再检查')
    }
  }

  // NUL/空文件不可当文本：跳过 L1；其它 L0 fail 不阻止 L1
  if (wantL1 && !skipTextScan) {
    const avail = await detectL1Tools(input.grantRootAbs)
    l1_available.ruff = avail.ruff
    l1_available.biome = avail.biome
    await runL1Checks(
      input.absPath,
      detected.language,
      avail,
      checks,
      fixHints,
      input.signal,
      diagnostics,
    )
  }

  if (wantL0 && !diagnostics.some(d => d.severity === 'error')) {
    fixHints.push('L0 通过后可用 opptrix_run 运行脚本')
  }

  return buildResult({
    path: input.path,
    language: detected.language,
    checks,
    diagnostics,
    fix_hints: [...new Set(fixHints)],
    l1_available,
  })
}

/** 供单测：仅静态 L0（不 spawn） */
export function runL0StaticOnly(input: {
  path: string
  buf: Buffer
  language?: PreflightLanguageOpt
}): CodePreflightResult {
  const checks: PreflightCheck[] = []
  const diagnostics: PreflightDiagnostic[] = []
  const fixHints: string[] = []
  const detected = detectLanguageFromPath(input.path, input.language ?? 'auto')

  checks.push({
    id: 'l0_exists',
    level: 'l0',
    status: 'pass',
    message: '文件存在且在授权工作区内可读',
  })

  checkEncoding(input.buf, checks, diagnostics)
  const skipTextScan = checks.some(
    c => (c.id === 'l0_empty' || c.id === 'l0_encoding_nul') && c.status === 'fail',
  )
  const content = input.buf.toString('utf8')
  if (!skipTextScan) {
    checkNewlines(content, checks, diagnostics)
    if (looksLikeScriptContent(input.path, content) || detected.syntaxKind !== 'unknown') {
      checkPlatformPathRules(content, checks, diagnostics)
    }
  }

  return buildResult({
    path: input.path,
    language: detected.language,
    checks,
    diagnostics,
    fix_hints: fixHints,
    l1_available: {},
  })
}
