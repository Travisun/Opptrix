#!/usr/bin/env node
/**
 * Generate Source Han Sans SC @font-face aliases pointing at Noto Sans SC files.
 *
 * Prefer: npm run prepare:fonts (asserts @fontsource + writes this file)
 * Direct: node scripts/generate-source-han-alias.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEIGHTS = [400, 500, 700]

/**
 * @param {string} root
 * @returns {string} absolute path to @fontsource/noto-sans-sc package dir
 */
function resolveNotoSansScDir(root) {
  const candidates = [
    path.join(root, 'node_modules', '@fontsource', 'noto-sans-sc'),
    path.join(root, 'client-ui', 'node_modules', '@fontsource', 'noto-sans-sc'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  throw new Error(
    'Cannot find @fontsource/noto-sans-sc under node_modules (root or client-ui). '
      + 'Run `npm ci` from the repo root. / 找不到 @fontsource/noto-sans-sc，请在仓库根目录执行 npm ci。',
  )
}

/**
 * @param {{ root?: string }} [opts]
 * @returns {{ dest: string, bytes: number }}
 */
export function generateSourceHanAlias(opts = {}) {
  const root = opts.root ?? DEFAULT_ROOT
  const pkg = resolveNotoSansScDir(root)

  let out =
    '/* Auto-generated: Source Han Sans SC aliases same files as Noto Sans SC (OFL). */\n'
    + '/* Do not edit by hand. Regenerate: npm run prepare:fonts */\n'
    + '/* Direct: node scripts/generate-source-han-alias.mjs */\n\n'

  for (const w of WEIGHTS) {
    const cssPath = path.join(pkg, `${w}.css`)
    if (!fs.existsSync(cssPath)) {
      throw new Error(`Missing ${cssPath} — reinstall @fontsource/noto-sans-sc`)
    }
    let css = fs.readFileSync(cssPath, 'utf8')
    css = css.replaceAll("font-family: 'Noto Sans SC';", "font-family: 'Source Han Sans SC';")
    css = css.replaceAll('url(./files/', 'url(@fontsource/noto-sans-sc/files/')
    out += `/* weight ${w} */\n${css}\n`
  }

  const dest = path.join(root, 'client-ui', 'src', 'styles', 'source-han-alias.css')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, out)
  console.log('wrote', dest, 'bytes', out.length)
  return { dest, bytes: out.length }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  generateSourceHanAlias()
}
