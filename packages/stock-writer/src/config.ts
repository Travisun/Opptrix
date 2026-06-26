import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets')

export interface WriterStyle {
  name?: string
  industry?: string
  topics?: string[]
  target_audience?: string
  persona_role?: string
  author?: string
  voice?: string
  analysis_approach?: string
  tone?: string
  data_usage?: string
  blacklist?: string[]
  writing_persona?: string
  compliance_awareness?: boolean
  [key: string]: unknown
}

export interface PersonaConfig {
  name: string
  description?: string
  voice_density?: number
  uncertainty_rate?: number
  paragraph_max_length?: number
  opening_style?: string
  closing_tendency?: string
  avoid?: string[]
  [key: string]: unknown
}

let styleCache: WriterStyle | null = null

export function loadStyle(customPath?: string): WriterStyle {
  if (styleCache && !customPath) return styleCache
  const p = customPath ?? path.join(ASSETS, 'style.yaml')
  const raw = yaml.load(fs.readFileSync(p, 'utf8')) as WriterStyle
  if (!customPath) styleCache = raw
  return raw
}

export function loadPersona(name: string): PersonaConfig {
  const p = path.join(ASSETS, 'personas', `${name}.yaml`)
  if (!fs.existsSync(p)) throw new Error(`Persona not found: ${name}`)
  return yaml.load(fs.readFileSync(p, 'utf8')) as PersonaConfig
}

export function listPersonas() {
  const dir = path.join(ASSETS, 'personas')
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace('.yaml', ''))
}

export function loadReference(name: string): string {
  const p = path.join(ASSETS, 'references', `${name}.md`)
  if (!fs.existsSync(p)) return ''
  return fs.readFileSync(p, 'utf8')
}

export function listReferences() {
  const dir = path.join(ASSETS, 'references')
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
}
