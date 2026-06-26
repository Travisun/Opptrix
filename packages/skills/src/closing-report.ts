import type { AshareEngine } from '@inno-a-stock/a-stock-layer'

const CN_INDICES: Record<string, string> = {
  '000001': '上证指数', '399001': '深证成指', '399006': '创业板指',
  '000688': '科创50', '000016': '上证50', '000300': '沪深300',
  '000905': '中证500', '000852': '中证1000',
}

function pct(v: number | null | undefined) {
  return v == null ? '--' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function fmtYi(v: number | null | undefined) {
  if (v == null) return '--'
  return `${(v / 1e8).toFixed(2)}亿`
}

export class ClosingReport {
  constructor(private engine: AshareEngine) {}

  async generate() {
    const today = new Date().toISOString().slice(0, 10)
    const indices: { name: string; change: string; amount?: string }[] = []

    for (const [code, name] of Object.entries(CN_INDICES)) {
      const r = await this.engine.indexRealtime(code)
      if (r.success && r.data?.[0]) {
        const d = r.data[0]
        indices.push({
          name,
          change: pct(d.changePct),
          amount: d.amount != null ? fmtYi(d.amount) : undefined,
        })
      }
    }

    const [breadthR, limitR, sectorR, dragonR, northR] = await Promise.all([
      this.engine.marketBreadth(),
      this.engine.limitUpdown(),
      this.engine.sectorMoneyFlow('industry'),
      this.engine.dragonTiger(),
      this.engine.marketMoneyFlow('north'),
    ])

    const breadth = breadthR.success && breadthR.data?.[0]
      ? breadthR.data[0] as Record<string, unknown>
      : null
    const limits = limitR.success && limitR.data ? limitR.data : []
    const limitUp = limits.filter(l => l.type === 'limit_up').length
    const limitDown = limits.filter(l => l.type === 'limit_down').length

    const topSectors = (sectorR.success && sectorR.data ? sectorR.data : [])
      .slice(0, 5)
      .map(s => `${s.sectorName ?? ''} ${pct(s.changePct)}`)
      .join(' · ')

    const dragonLine = (dragonR.success && dragonR.data ? dragonR.data : [])
      .slice(0, 5)
      .map(d => `${d.name}(${d.code}) ${pct(d.changePct)}`)
      .join('、')

    const northLine = northR.success && northR.data?.[0]
      ? `北向 ${fmtYi(northR.data[0].netAmount)}`
      : '北向数据暂不可用'

    const indexLines = indices.map(i => `${i.name} ${i.change}`).join(' · ')
    const upCount = indices.filter(i => i.change.startsWith('+')).length
    const breadthLine = breadth
      ? `上涨家数占比 ${(breadth as { advancePct?: number }).advancePct ?? '--'}%，涨停 ${limitUp} / 跌停 ${limitDown}`
      : `涨停 ${limitUp} / 跌停 ${limitDown}`

    const sections = [
      { title: '大盘表现', content: indexLines || '指数数据暂不可用' },
      { title: '市场广度', content: breadthLine },
      { title: '资金流向', content: [northLine, topSectors ? `热点行业: ${topSectors}` : ''].filter(Boolean).join('\n') },
      { title: '龙虎榜', content: dragonLine || '暂无龙虎榜数据' },
      {
        title: '市场研判',
        content: upCount >= indices.length / 2
          ? '多数指数收涨，市场情绪偏暖，关注量能能否持续。'
          : '多数指数收跌，注意控制仓位与板块分化风险。',
      },
      { title: '操作建议', content: '关注成交量、板块轮动、北向资金与机构共识变化。' },
    ]

    const summary = [
      indexLines,
      breadthLine,
      northLine,
    ].filter(Boolean).join(' | ')

    return {
      report_type: 'closing' as const,
      title: `A股收盘报告 ${today}`,
      date: today,
      summary,
      sections,
      indices,
      limit_up: limitUp,
      limit_down: limitDown,
      market_breadth: breadth,
    }
  }
}
