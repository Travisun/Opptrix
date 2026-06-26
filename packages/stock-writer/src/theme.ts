import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const THEMES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/themes')

export interface ThemeColors {
  primary?: string
  secondary?: string
  text?: string
  text_light?: string
  background?: string
  code_bg?: string
  code_color?: string
  quote_border?: string
  quote_bg?: string
  border_radius?: string
}

export interface Theme {
  name: string
  description?: string
  colors: ThemeColors
}

export function listThemes() {
  if (!fs.existsSync(THEMES_DIR)) return ['minimal-clean']
  return fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.yaml')).map(f => f.replace('.yaml', ''))
}

export function loadTheme(name: string): Theme {
  const aliases: Record<string, string> = { minimal: 'minimal-clean' }
  const resolved = aliases[name] ?? name
  const p = path.join(THEMES_DIR, `${resolved}.yaml`)
  if (!fs.existsSync(p)) throw new Error(`Theme not found: ${name}`)
  const data = yaml.load(fs.readFileSync(p, 'utf8')) as Theme
  return { ...data, colors: data.colors ?? {} }
}

export function inlineStyles(colors: ThemeColors) {
  const t = colors.text ?? '#333333'
  const tl = colors.text_light ?? '#666666'
  const cb = colors.code_bg ?? '#f5f5f5'
  const cc = colors.code_color ?? '#d73a49'
  const qb = colors.quote_bg ?? '#f9f9f9'
  const qborder = colors.quote_border ?? '#cccccc'
  const br = colors.border_radius ?? '4px'
  return {
    h2: `font-size:22px;font-weight:700;color:${t};margin:28px 0 14px;padding-bottom:8px;border-bottom:1px solid #e0e0e0;line-height:1.4;`,
    h3: `font-size:18px;font-weight:600;color:${t};margin:24px 0 12px;line-height:1.4;`,
    h4: `font-size:16px;font-weight:600;color:${t};margin:20px 0 10px;line-height:1.4;`,
    p: `font-size:16px;line-height:1.8;color:${t};margin:12px 0;`,
    strong: `font-weight:700;color:${t};`,
    em: `font-style:italic;color:${t};`,
    blockquote: `border-left:3px solid ${qborder};background:${qb};margin:16px 0;padding:12px 16px;border-radius:0 ${br} ${br} 0;color:${tl};`,
    code: `font-family:Consolas,Menlo,monospace;font-size:14px;background:${cb};color:${cc};padding:2px 6px;border-radius:${br};`,
    pre: `background:${cb};padding:16px;border-radius:${br};overflow-x:auto;margin:16px 0;line-height:1.6;border:1px solid #e0e0e0;`,
    img: `max-width:100%;height:auto;display:block;margin:24px auto;border-radius:${br};`,
    table: `width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;`,
    th: `background:rgba(0,0,0,0.03);font-weight:600;padding:10px 14px;text-align:left;border:1px solid #e0e0e0;color:${t};`,
    td: `padding:10px 14px;border:1px solid #e0e0e0;color:${t};`,
    a: `color:${t};text-decoration:underline;`,
    hr: `border:none;border-top:1px solid #e0e0e0;margin:24px 0;`,
    li: `font-size:16px;line-height:1.8;color:${t};margin:6px 0;`,
  } as const
}
