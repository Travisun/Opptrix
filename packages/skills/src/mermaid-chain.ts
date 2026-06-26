import { matchIndustryChain } from './chain-knowledge.js'

interface ChainNode {
  position: string
  keywords?: string[]
  desc?: string
  bottleneck?: boolean
  bottleneck_type?: string
  domestic_rate?: string
}

/** Mermaid mindmap for industry chain — mirrors Python visualizer.mermaid_industry_chain */
export function mermaidIndustryChain(
  industry: string,
  nodeAnalysis: Record<string, { name: string }[]> = {},
) {
  const hit = matchIndustryChain(industry)
  if (!hit) return null

  const nodes = hit.chain.nodes as ChainNode[]
  const categories: Record<string, ChainNode[]> = { 上游: [], 中游: [], 下游: [] }
  for (const node of nodes) {
    for (const cat of Object.keys(categories)) {
      if (node.position.startsWith(cat)) {
        categories[cat].push(node)
        break
      }
    }
  }

  const lines = ['```mermaid', 'mindmap', `  root((${hit.key}产业链))`]
  for (const [cat, catNodes] of Object.entries(categories)) {
    if (!catNodes.length) continue
    lines.push(`    ${cat}`)
    for (const node of catNodes) {
      const pos = node.position.replace(`${cat} — `, '').replace(`${cat}-`, '')
      const companies = (nodeAnalysis[node.position] ?? []).slice(0, 2).map(c => c.name).join(' ')
      let label = pos
      if (node.domestic_rate) label += ` [${node.domestic_rate}]`
      if (node.bottleneck) label += ' 🚨'
      if (companies) label += ` ·${companies}`
      lines.push(`      ${label}`)
    }
  }
  lines.push('```')
  return lines.join('\n')
}
