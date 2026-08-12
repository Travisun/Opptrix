#!/usr/bin/env node
/**
 * Prepare UI fonts for client-ui builds (CI + local).
 *
 * 1. Assert @fontsource packages resolve (root hoisted or client-ui/node_modules)
 * 2. Generate client-ui/src/styles/source-han-alias.css (Source Han → Noto files)
 * 3. Assert generated CSS content
 *
 * Usage: node scripts/prepare-ui-fonts.mjs
 *        npm run prepare:fonts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateSourceHanAlias } from './generate-source-han-alias.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const WEIGHTS = [400, 500, 700]

/** @type {ReadonlyArray<{ pkg: string, files: string[] }>} */
const FONT_PACKAGES = [
  { pkg: '@fontsource/noto-sans-sc', files: WEIGHTS.map((w) => `${w}.css`) },
  { pkg: '@fontsource/inter', files: WEIGHTS.map((w) => `${w}.css`) },
  { pkg: '@fontsource/jetbrains-mono', files: WEIGHTS.map((w) => `${w}.css`) },
]

/**
 * Prefer repo-root hoisted node_modules; fall back to client-ui workspace install.
 * @param {string} pkgScopedName e.g. `@fontsource/inter`
 * @returns {string | null} absolute package directory
 */
export function resolveFontsourcePkgDir(pkgScopedName) {
  const candidates = [
    path.join(ROOT, 'node_modules', ...pkgScopedName.split('/')),
    path.join(ROOT, 'client-ui', 'node_modules', ...pkgScopedName.split('/')),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return null
}

/**
 * @param {string} messageEn
 * @param {string} messageZh
 * @returns {never}
 */
function fail(messageEn, messageZh) {
  const err = new Error(`${messageEn}\n${messageZh}`)
  err.name = 'PrepareUiFontsError'
  throw err
}

/**
 * Assert all required @fontsource CSS weight files are readable.
 * @returns {Map<string, string>} pkg → absolute dir
 */
export function assertFontsourcePackages() {
  /** @type {Map<string, string>} */
  const resolved = new Map()
  for (const { pkg, files } of FONT_PACKAGES) {
    const dir = resolveFontsourcePkgDir(pkg)
    if (!dir) {
      fail(
        `Missing dependency ${pkg}. Run \`npm ci\` from the repo root, then retry.`,
        `缺少依赖 ${pkg}。请在仓库根目录执行 \`npm ci\` 后重试。`,
      )
    }
    for (const file of files) {
      const abs = path.join(dir, file)
      if (!fs.existsSync(abs)) {
        fail(
          `Missing ${pkg}/${file} under ${dir}. Reinstall @fontsource packages or check package version.`,
          `缺少 ${pkg}/${file}（查找路径: ${dir}）。请重装 @fontsource 依赖或核对版本。`,
        )
      }
      try {
        fs.accessSync(abs, fs.constants.R_OK)
        fs.readFileSync(abs, 'utf8')
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        fail(
          `Cannot read ${abs}: ${detail}`,
          `无法读取 ${abs}: ${detail}`,
        )
      }
    }
    resolved.set(pkg, dir)
    console.log(`[prepare-ui-fonts] ok ${pkg} → ${path.relative(ROOT, dir)}`)
  }
  return resolved
}

/**
 * Assert generated Source Han alias CSS exists and looks valid.
 * @param {string} dest absolute path
 */
export function assertSourceHanAlias(dest) {
  if (!fs.existsSync(dest)) {
    fail(
      `Expected generated file missing: ${dest}`,
      `未找到生成文件: ${dest}`,
    )
  }
  const css = fs.readFileSync(dest, 'utf8')
  if (!css.includes('Source Han Sans SC')) {
    fail(
      `Generated ${dest} must contain font-family "Source Han Sans SC".`,
      `生成的 ${dest} 必须包含字体族 "Source Han Sans SC"。`,
    )
  }
  if (!css.includes('url(@fontsource/noto-sans-sc/files/')) {
    fail(
      `Generated ${dest} must reference url(@fontsource/noto-sans-sc/files/…).`,
      `生成的 ${dest} 必须引用 url(@fontsource/noto-sans-sc/files/…)。`,
    )
  }
  console.log(`[prepare-ui-fonts] ok alias ${path.relative(ROOT, dest)} (${css.length} bytes)`)
}

/**
 * Full prepare pipeline (assert packages → generate → assert output).
 * @returns {{ dest: string, bytes: number }}
 */
export function prepareUiFonts() {
  assertFontsourcePackages()
  const { dest, bytes } = generateSourceHanAlias({ root: ROOT })
  assertSourceHanAlias(dest)
  return { dest, bytes }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  try {
    const { dest, bytes } = prepareUiFonts()
    console.log(`[prepare-ui-fonts] ready ${path.relative(ROOT, dest)} (${bytes} bytes)`)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[prepare-ui-fonts] ERROR: ${detail}`)
    process.exit(1)
  }
}
