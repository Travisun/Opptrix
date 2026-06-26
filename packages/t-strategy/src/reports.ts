import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import { computeAll, lastRow } from './indicators.js'
import { SignalEngine, verifyStrategy } from './signal-engine.js'
import { listStrategies } from './strategies.js'

const DIR_MAP: Record<string, string> = { BUY: '▲ BUY', SELL: '▼ SELL', HOLD: '◆ HOLD' }

export async function generateStrategyReport(de: AshareEngine, code: string) {
  const se = new SignalEngine(de)
  const r = await se.analyze(code)
  const rt = await de.realtime(code)
  const name = rt.data?.[0]?.name ?? code

  const lines = [
    '='.repeat(58),
    `  ${name} (${code}) — T 策略全分析报告`,
    `  当前价: ${r.price}  |  综合评分: ${r.score.toFixed(0)}/100`,
    `  决策: ${r.verdict}  |  置信度: ${(r.confidence * 100).toFixed(0)}%`,
    '='.repeat(58),
    '',
    `📋 已加载 ${listStrategies().length} 个策略:`,
    ...listStrategies().map(s => `  • ${s.displayName}`),
    '',
    `📡 检测到 ${r.signals.length} 个信号:`,
    ...r.signals.slice(0, 20).map(s =>
      `  [${(DIR_MAP[s.direction] ?? s.direction).padEnd(8)}] [${s.source.padEnd(22)}] ${s.reason ?? ''}`),
  ]

  const kl = await de.kline(code, 60)
  if (kl.success && kl.data && kl.data.length >= 20) {
    const ti = computeAll(kl.data)
    const last = lastRow(ti)
    if (last) {
      lines.push('', '📊 关键技术位:')
      for (const [col, label] of [
        ['ma5', 'MA5'], ['ma10', 'MA10'], ['ma20', 'MA20'], ['ma60', 'MA60'],
        ['boll_up', 'Boll上轨'], ['boll_mid', 'Boll中轨'], ['boll_low', 'Boll下轨'],
      ] as const) {
        const v = last[col]
        if (v != null) lines.push(`  ${label.padStart(8)}: ${Number(v).toFixed(1).padStart(8)}`)
      }
      const highs = kl.data.slice(-30).map(k => k.high)
      const lows = kl.data.slice(-30).map(k => k.low)
      lines.push(`  ${'30日高'.padStart(8)}: ${Math.max(...highs).toFixed(1).padStart(8)}`)
      lines.push(`  ${'30日低'.padStart(8)}: ${Math.min(...lows).toFixed(1).padStart(8)}`)
    }
  }

  if (r.verdict !== 'HOLD') {
    const action = r.verdict === 'BUY' ? '加仓 T 买入' : '减仓 T 卖出'
    lines.push('', `💡 操作建议: ${action}`)
  } else {
    lines.push('', '💡 操作建议: 持有观望，等待明确信号')
  }

  return lines.join('\n')
}

export function formatVerificationReport(data: Awaited<ReturnType<typeof verifyStrategy>>) {
  const hdr = [
    '='.repeat(88),
    '  策略历史信号验证报告',
    '='.repeat(88),
    `  股票: ${data.name} (${data.code})`,
    `  检查点: ${data.checkpoints}个  |  预测周期: ${data.forward_days ?? 5}个交易日`,
    data.date_range?.length === 2 ? `  数据区间: ${data.date_range[0]} ~ ${data.date_range[1]}` : '',
    '-'.repeat(88),
    `  ${'策略'.padEnd(14)} ${'检查'.padEnd(5)} ${'买'.padEnd(4)} ${'卖'.padEnd(4)} `
      + `${'胜率'.padEnd(7)} ${'买胜率'.padEnd(8)} ${'精确率'.padEnd(8)} ${'召回'.padEnd(7)} ${'频率'.padEnd(6)} ${'收益'.padEnd(8)} Sharpe`,
    '-'.repeat(88),
  ].filter(Boolean)

  const lines = [...hdr]
  for (const p of data.performances ?? []) {
    const wr = ((p.overall_win_rate ?? 0) * 100).toFixed(1)
    const bwr = ((p.buy_win_rate ?? 0) * 100).toFixed(1)
    const prec = ((p.precision ?? 0) * 100).toFixed(1)
    const rec = ((p.recall ?? 0) * 100).toFixed(1)
    const freq = ((p.signal_freq ?? 0) * 100).toFixed(1)
    const ret = ((p.avg_return ?? 0) * 100).toFixed(2)
    const sharpe = p.sharpe != null ? p.sharpe.toFixed(1) : '—'
    lines.push(
      `  ${p.name.padEnd(14)} ${String(p.signal_count ?? 0).padEnd(5)} `
      + `${String(p.buy_signals ?? 0).padEnd(4)} ${String(p.sell_signals ?? 0).padEnd(4)} `
      + `${wr.padStart(5)}% ${bwr.padStart(6)}% ${prec.padStart(6)}% ${rec.padStart(5)}% `
      + `${freq.padStart(4)}% ${ret.padStart(6)}% ${sharpe.padStart(6)}`,
    )
  }

  const active = (data.performances ?? []).filter(p => (p.buy_signals ?? 0) + (p.sell_signals ?? 0) > 0)
  if (active.length) {
    const avgWr = active.reduce((a, p) => a + (p.overall_win_rate ?? 0), 0) / active.length
    const withSharpe = active.filter(p => p.sharpe != null)
    const avgSharpe = withSharpe.reduce((a, p) => a + (p.sharpe ?? 0), 0) / Math.max(1, withSharpe.length)
    lines.push('-'.repeat(88))
    lines.push(`  平均胜率: ${(avgWr * 100).toFixed(1)}%  |  平均 Sharpe: ${avgSharpe.toFixed(2)}`)
    if (data.best_strategy) {
      lines.push(`  最佳策略: ${data.best_strategy.name} (${(data.best_strategy.win_rate * 100).toFixed(1)}%)`)
    }
  }
  lines.push('='.repeat(88))
  return lines.join('\n')
}

export function strategySummary() {
  return ['可用的 T 策略:', ...listStrategies().map(s => `  • ${s.name.padEnd(20)} — ${s.displayName}`)].join('\n')
}
