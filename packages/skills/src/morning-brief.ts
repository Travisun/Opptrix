import type { AshareEngine } from '@ni-k/a-stock-layer'

const CN_INDICES: Record<string, string> = {
  '000001': '上证指数', '399001': '深证成指', '399006': '创业板指',
  '000688': '科创50', '000300': '沪深300', '000905': '中证500',
}

function pct(v: number | null | undefined) {
  return v == null ? '--' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

export class MorningBrief {
  constructor(private engine: AshareEngine) {}

  async generate() {
    const today = new Date().toISOString().slice(0, 10)
    const indices: { name: string; change: string }[] = []

    for (const [code, name] of Object.entries(CN_INDICES)) {
      const r = await this.engine.indexRealtime(code)
      if (r.success && r.data?.[0]) {
        indices.push({ name, change: pct(r.data[0].changePct) })
      }
    }

    const [globalR, northR, breadthR] = await Promise.all([
      this.engine.globalIndex('dji'),
      this.engine.marketMoneyFlow('north'),
      this.engine.marketBreadth(),
    ])

    const globalLine = globalR.success && globalR.data?.[0]
      ? `道琼斯 ${pct(globalR.data[0].changePct)}`
      : '全球指数暂不可用'

    const northLine = northR.success && northR.data?.[0]
      ? `北向预估 ${(northR.data[0].netAmount / 1e8).toFixed(2)}亿`
      : ''

    const breadth = breadthR.success && breadthR.data?.[0] ? breadthR.data[0] : null
    const indexLine = indices.map(i => `${i.name} ${i.change}`).join(' · ')
    const upCount = indices.filter(i => i.change.startsWith('+')).length

    const sections = [
      { title: '隔夜A股指数', content: indexLine || '指数数据暂不可用' },
      { title: '外围市场', content: globalLine },
      ...(northLine ? [{ title: '北向资金', content: northLine }] : []),
      ...(breadth ? [{
        title: '市场温度',
        content: `上涨占比 ${(breadth as { advancePct?: number }).advancePct ?? '--'}%`,
      }] : []),
      {
        title: '开盘预判',
        content: upCount >= indices.length / 2
          ? '主要指数偏强，关注高开板块与量能配合。'
          : '主要指数偏弱，注意开盘缺口与防御性配置。',
      },
    ]

    return {
      report_type: 'morning' as const,
      title: `A股开盘早报 ${today}`,
      date: today,
      summary: [indexLine, globalLine, northLine].filter(Boolean).join(' · '),
      sections,
      indices,
    }
  }
}
