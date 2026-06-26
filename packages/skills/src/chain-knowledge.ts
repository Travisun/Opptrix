import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface ChainNode {
  position: string
  keywords: string[]
  desc: string
  bottleneck?: boolean
  bottleneck_type?: string
  domestic_rate?: string
}

interface ChainEntry {
  name: string
  nodes: ChainNode[]
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const jsonPath = path.join(__dirname, 'chain-knowledge.json')

let _cache: Record<string, ChainEntry> | null = null

function loadChains() {
  if (!_cache) {
    _cache = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, ChainEntry>
  }
  return _cache
}

export function matchIndustryChain(query: string) {
  const INDUSTRY_CHAINS = loadChains()
  const q = query.trim()
  if (INDUSTRY_CHAINS[q]) return { key: q, chain: INDUSTRY_CHAINS[q] }

  for (const [key, chain] of Object.entries(INDUSTRY_CHAINS)) {
    if (key.includes(q) || q.includes(key)) return { key, chain }
    for (const node of chain.nodes) {
      if (node.keywords.some(kw => q.includes(kw) || kw.includes(q))) {
        return { key, chain }
      }
    }
  }
  return null
}

export function formatChainReport(industry: string) {
  const hit = matchIndustryChain(industry)
  if (!hit) return null

  const lines = [`【${hit.chain.name}】产业链深度拆解\n`]
  for (const node of hit.chain.nodes) {
    lines.push(`▸ ${node.position}`)
    lines.push(`  ${node.desc}`)
    if (node.bottleneck) {
      lines.push(`  ⚠ 瓶颈: ${node.bottleneck_type ?? '是'} | 国产化率: ${node.domestic_rate ?? 'N/A'}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function listIndustries() {
  return Object.keys(loadChains())
}
