import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import { formatChainReport, matchIndustryChain } from './chain-knowledge.js'
import { mermaidIndustryChain } from './mermaid-chain.js'
import { ClosingReport } from './closing-report.js'
import { MorningBrief } from './morning-brief.js'

export class IndustryMining {
  constructor(private engine: AshareEngine) {}

  async analyze(industry: string) {
    const list = await this.engine.stockList()
    const hit = matchIndustryChain(industry)
    const searchKey = hit?.key ?? industry

    const companies = (list.data ?? [])
      .filter(s => {
        if (s.industry.includes(searchKey) || searchKey.includes(s.industry)) return true
        if (hit) {
          return hit.chain.nodes.some(n =>
            n.keywords.some(kw => s.industry.includes(kw) || s.name.includes(kw)))
        }
        return s.name.includes(industry)
      })
      .slice(0, 30)

    const chainReport = formatChainReport(industry)
    const mermaid = mermaidIndustryChain(industry)
    const chainOverview = chainReport ?? (
      `【${industry}】产业链透视\n\n` +
      `上游：原材料与核心零部件\n中游：${industry}制造与集成\n下游：应用与渠道`
    )

    const companyLine = companies.length
      ? companies.slice(0, 10).map(c => `${c.name}(${c.code})`).join('、')
      : '暂无精确匹配'

    return {
      industry: hit?.key ?? industry,
      summary: `${chainOverview.slice(0, 300)}\n\n代表标的: ${companyLine}`,
      chain_overview: chainOverview,
      mermaid,
      key_companies: companies.length,
      companies: companies.map(c => ({ code: c.code, name: c.name, industry: c.industry })),
      chain_nodes: hit?.chain.nodes.length ?? 0,
    }
  }
}

export { ClosingReport, MorningBrief }
export { formatChainReport, matchIndustryChain, listIndustries } from './chain-knowledge.js'
export { mermaidIndustryChain } from './mermaid-chain.js'
