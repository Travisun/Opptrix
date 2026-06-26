import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'

const HISTORY_PATH = path.join(os.homedir(), '.a_stock_layer', 'writer-history.yaml')

export interface HistoryEntry {
  date: string
  title: string
  stock_code?: string
  stock_name?: string
  article_type?: string
  framework?: string
  persona?: string
  word_count?: number
  media_id?: string | null
  compliance_check?: string
  theme?: string
}

export function appendHistory(entry: HistoryEntry) {
  const dir = path.dirname(HISTORY_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let items: HistoryEntry[] = []
  if (fs.existsSync(HISTORY_PATH)) {
    const raw = yaml.load(fs.readFileSync(HISTORY_PATH, 'utf8'))
    items = Array.isArray(raw) ? raw as HistoryEntry[] : (raw as { articles?: HistoryEntry[] })?.articles ?? []
  }
  items.unshift(entry)
  fs.writeFileSync(HISTORY_PATH, yaml.dump(items.slice(0, 200)), 'utf8')
}

export function listHistory(limit = 20) {
  if (!fs.existsSync(HISTORY_PATH)) return []
  const raw = yaml.load(fs.readFileSync(HISTORY_PATH, 'utf8'))
  const items = Array.isArray(raw) ? raw as HistoryEntry[] : (raw as { articles?: HistoryEntry[] })?.articles ?? []
  return items.slice(0, limit)
}
