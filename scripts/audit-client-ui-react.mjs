#!/usr/bin/env node
/**
 * client-ui React 模式审查（补充 ESLint 难以覆盖的仓库内历史坑位）
 *
 * 覆盖问题类型：
 * - 列表 key 仅用业务字段（重复 key 警告）
 * - Hook 参数内联解析 instrument（每次渲染新引用 → useEffect 死循环）
 * - useEffect 依赖 reset 回调（易 Maximum update depth）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UI_SRC = path.join(ROOT, 'client-ui', 'src')

/** @type {Array<{ id: string, severity: 'error' | 'warn', message: string, test: (ctx: AuditCtx) => string | null }>} */
const RULES = [
  {
    id: 'unstable-hook-inline-call',
    severity: 'error',
    message: 'Hook 参数内联调用会每次渲染产生新引用，请 useMemo 稳定化或在 hook 内用 instrumentKey 作依赖',
    test: ({ line }) => {
      if (!/\buse(?:StockAnalysis|Effect|Memo|Callback)\s*\(/.test(line)) return null
      if (/\buseMemo\s*\(/.test(line)) return null
      if (/\b(resolveWatchlistInstrument|normalizeWatchlistItem|parseInstrumentInput)\s*\(/.test(line)) {
        return 'inline instrument resolver in hook args'
      }
      return null
    },
  },
  {
    id: 'fragile-list-key',
    severity: 'warn',
    message: '列表 key 仅依赖业务字段可能重复，优先 listRowKey(index, …) 或稳定 id',
    test: ({ line }) => {
      if (!/\bkey=\{`/.test(line)) return null
      if (/\blistRowKey\s*\(/.test(line)) return null
      if (/\bindex\b/.test(line)) return null
      if (/\$\{[^}]*\.(id|uuid|key|code)\}/.test(line)) return null
      return 'template key without index/listRowKey'
    },
  },
  {
    id: 'effect-reset-loop',
    severity: 'error',
    message: 'useEffect 依赖 reset 回调易触发无限更新，请内联重置逻辑并稳定 instrument 依赖',
    test: ({ lines, index }) => {
      const chunk = lines.slice(index, index + 10).join('\n')
      if (!/\buseEffect\s*\(/.test(chunk)) return null
      if (/\breset\s*\(\s*\)/.test(chunk) && /\[[^\]]*\breset\b[^\]]*\]/.test(chunk)) {
        return 'useEffect depends on reset()'
      }
      return null
    },
  },
]

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

function auditFile(file) {
  const rel = path.relative(ROOT, file)
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  /** @type {Array<{ rule: string, severity: string, message: string, line: number, detail: string }>} */
  const findings = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const ctx = { file, rel, line, lines, index: i }
    for (const rule of RULES) {
      const detail = rule.test(ctx)
      if (detail) {
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          message: rule.message,
          rel,
          line: i + 1,
          detail,
        })
      }
    }
  }
  return findings
}

function main() {
  if (!fs.existsSync(UI_SRC)) {
    console.error('[audit:ui] client-ui/src not found')
    process.exit(1)
  }

  const files = walk(UI_SRC)
  const all = files.flatMap(auditFile)
  const errors = all.filter(f => f.severity === 'error')
  const warns = all.filter(f => f.severity === 'warn')

  if (all.length === 0) {
    console.log('[audit:ui] OK — no React pattern issues')
    process.exit(0)
  }

  for (const f of all) {
    const tag = f.severity === 'error' ? 'error' : 'warn'
    console.log(`${tag} [${f.rule}] ${f.rel}:${f.line} — ${f.message}`)
    console.log(`       ${f.detail}`)
  }

  console.log(`\n[audit:ui] ${errors.length} error(s), ${warns.length} warning(s)`)
  process.exit(errors.length > 0 ? 1 : 0)
}

main()
