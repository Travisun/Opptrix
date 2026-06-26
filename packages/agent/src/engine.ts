import type { ResearchHub } from '@ni-k/research-hub'
import { createProvider, isConfigured, type LlmConfig } from './llm/provider.js'
import { ToolRegistry } from './tools.js'

export interface AgentSettings {
  llm: LlmConfig
  defaultScorecard: string
  defaultTopN: number
}

export class AgentEngine {
  readonly tools: ToolRegistry
  private llm
  private history: { role: string; content: string }[] = []

  constructor(
    private hub: ResearchHub,
    private settings: AgentSettings,
  ) {
    this.tools = new ToolRegistry(hub)
    this.llm = createProvider(this.settings.llm)
  }

  get llmConfigured() { return isConfigured(this.settings.llm) }

  setLlmConfig(cfg: Partial<LlmConfig>) {
    Object.assign(this.settings.llm, cfg)
    this.llm = createProvider(this.settings.llm)
  }

  async chat(message: string): Promise<string> {
    if (!message.trim()) return '请输入问题。'
    this.history.push({ role: 'user', content: message })

    const cmd = await this.tryCommand(message)
    if (cmd != null) {
      this.history.push({ role: 'assistant', content: cmd })
      return cmd
    }

    if (!this.llmConfigured) {
      return '⚠️ LLM 未配置。请在设置中配置 DeepSeek API Key。\n也可使用命令：/evaluate <代码>、/search <关键词>、/help'
    }

    const messages = [
      { role: 'system', content: this.tools.systemPrompt() },
      ...this.history.slice(-10),
    ]
    const reply = await this.llm.chat(messages)
    this.history.push({ role: 'assistant', content: reply })
    return reply
  }

  private async tryCommand(message: string): Promise<string | null> {
    const msg = message.trim()
    if (msg === '/help') {
      return [
        '可用命令:',
        '  /evaluate <代码> [评分卡]',
        '  /screen roe>15 debt_ratio<50',
        '  /search <关键词>',
        '  /signal <代码>',
        '  /close  /morning',
        '  /portfolio 代码:权重 ...',
        '  /history <代码>',
        '  /institution <代码>',
        '  /writer <代码> [类型] [人格]',
        '  /writer types  /writer personas',
      ].join('\n')
    }

    if (msg.startsWith('/evaluate ')) {
      const parts = msg.split(/\s+/)
      const code = parts[1]
      if (!code) return '用法: /evaluate <股票代码>'
      const r = await this.hub.dispatch('stock_diagnosis', {
        code, scorecard: parts[2] ?? this.settings.defaultScorecard,
      })
      if (!r.success || !r.data) return `❌ ${r.message}`
      const d = r.data as Record<string, unknown>
      return [
        `📊 ${d.name}(${d.code}) 评估结果`,
        `综合评分: ${d.total_score}`,
        `有效因子: ${d.valid_factor_count} / ${d.total_factor_count}`,
      ].join('\n')
    }

    if (msg.startsWith('/search ')) {
      const keyword = msg.slice(8).trim()
      const r = await this.hub.dispatch('search_stocks', { keyword })
      if (!r.success || !r.data) return `❌ ${r.message}`
      const results = (r.data as { results: { code: string; name: string; industry?: string }[] }).results
      return ['🔎 搜索结果:', ...results.slice(0, 15).map(x =>
        `  ${x.code.padEnd(8)} ${x.name} ${x.industry ?? ''}`)].join('\n')
    }

    if (msg.startsWith('/signal ')) {
      const code = msg.slice(8).trim()
      const r = await this.hub.dispatch('strategy_signal', { code })
      return r.success ? r.message : `❌ ${r.message}`
    }

    if (msg.startsWith('/screen')) {
      const parts = msg.split(/\s+/).slice(1)
      const conditions: { factor: string; op: string; value: number }[] = []
      for (const p of parts) {
        for (const op of ['>=', '<=', '>', '<', '='] as const) {
          if (p.includes(op)) {
            const [factor, val] = p.split(op)
            conditions.push({ factor, op, value: Number(val) })
            break
          }
        }
      }
      if (!conditions.length) return '用法: /screen roe>15 debt_ratio<50'
      const r = await this.hub.dispatch('screening', {
        conditions, scorecard: this.settings.defaultScorecard, top_n: this.settings.defaultTopN,
      })
      if (!r.success || !r.data) return `❌ ${r.message}`
      const d = r.data as { total_scanned: number; passed: number; items: { code: string; name: string; total_score: number }[] }
      return [
        `🔍 扫描 ${d.total_scanned} 通过 ${d.passed}`,
        ...d.items.slice(0, 10).map(i => `  ${i.code} ${i.name} 评分 ${i.total_score}`),
      ].join('\n')
    }

    if (msg === '/close' || msg === '/closing') {
      const r = await this.hub.dispatch('market_report', { type: 'closing' })
      if (!r.success || !r.data) return `❌ ${r.message}`
      const d = r.data as { summary: string; title: string; sections?: { title: string; content: string }[] }
      const body = d.sections?.map(s => `【${s.title}】\n${s.content}`).join('\n\n') ?? d.summary
      return `${d.title}\n\n${body}`
    }

    if (msg === '/morning') {
      const r = await this.hub.dispatch('market_report', { type: 'morning' })
      if (!r.success || !r.data) return `❌ ${r.message}`
      const d = r.data as { summary: string; title: string; sections?: { title: string; content: string }[] }
      const body = d.sections?.map(s => `【${s.title}】\n${s.content}`).join('\n\n') ?? d.summary
      return `${d.title}\n\n${body}`
    }

    if (msg.startsWith('/portfolio ') || msg.startsWith('/pf ')) {
      const parts = msg.split(/\s+/).slice(1)
      const holdings: [string, number][] = []
      for (const p of parts) {
        const [code, w] = p.split(':')
        if (code && w) holdings.push([code, Number(w)])
      }
      if (!holdings.length) return '用法: /portfolio 600519:0.5 000858:0.5'
      const r = await this.hub.dispatch('portfolio_analysis', {
        holdings, scorecard: this.settings.defaultScorecard,
      })
      if (!r.success || !r.data) return `❌ ${r.message}`
      const d = r.data as { holdings?: { code: string; name: string; weight: number; score?: number }[]; avg_score?: number }
      const lines = [`📦 组合分析 (${holdings.length} 只)`, `平均评分: ${d.avg_score ?? '--'}`]
      for (const h of d.holdings ?? []) {
        lines.push(`  ${h.code} ${h.name} 权重 ${(h.weight * 100).toFixed(0)}% 评分 ${h.score ?? '--'}`)
      }
      return lines.join('\n')
    }

    if (msg.startsWith('/history ')) {
      const code = msg.split(/\s+/)[1]
      if (!code) return '用法: /history <代码>'
      const r = await this.hub.dispatch('latest_evaluation', { code })
      if (!r.success || !r.data) return `没有 ${code} 的历史记录`
      const d = r.data as { name: string; code: string; timestamp: string; scorecard: string; total_score: number }
      return [
        `📜 ${d.name}(${d.code}) 上次评估`,
        `时间: ${d.timestamp}`,
        `评分卡: ${d.scorecard}`,
        `总分: ${d.total_score}`,
      ].join('\n')
    }

    if (msg.startsWith('/institution ')) {
      const code = msg.split(/\s+/)[1]
      const r = await this.hub.dispatch('institution_rating', { code })
      if (!r.success || !r.data) return `❌ ${r.message}`
      const d = r.data as { name: string; consensus_rating_cn: string; avg_confidence: number }
      return `${d.name} 机构共识: ${d.consensus_rating_cn} (信心 ${d.avg_confidence}/10)`
    }

    if (msg === '/writer types') {
      const r = await this.hub.dispatch('writer_types', {})
      const types = (r.data as { types: { id: string; name: string }[] })?.types ?? []
      return ['📝 文章类型:', ...types.map(t => `  ${t.id.padEnd(12)} ${t.name}`)].join('\n')
    }

    if (msg === '/writer personas') {
      const r = await this.hub.dispatch('writer_personas', {})
      const personas = (r.data as { personas: string[] })?.personas ?? []
      return ['🎭 写作人格:', ...personas.map(p => `  • ${p}`)].join('\n')
    }

    if (msg.startsWith('/writer ')) {
      const parts = msg.split(/\s+/).filter(Boolean)
      const code = parts[1]
      if (!code || code === 'types' || code === 'personas') return '用法: /writer <代码> [类型] [人格]'
      const type = parts[2] ?? 'value'
      const persona = parts[3]

      const lines = ['[1/8] 环境 + 配置 ✓', '[2/8] 数据采集...']
      const r = await this.hub.dispatch('writer_prompt', { code, type, persona })
      if (!r.success || !r.data) return `❌ ${r.message}`

      const d = r.data as {
        data: { name: string; code: string; templateName: string; summary: { requiredOk: number; requiredTotal: number } }
        prompt: { system: string; user: string; meta: { persona: string } }
      }
      lines.push('[2/8] 数据采集 ✓', '[3/8] 框架 + 增强 ✓', '[4/8] 写作 Prompt 已生成')
      lines.push(
        '',
        `📰 ${d.data.name}(${d.data.code}) — ${d.data.templateName}`,
        `数据维度: ${d.data.summary.requiredOk}/${d.data.summary.requiredTotal}`,
        `人格: ${d.prompt.meta.persona}`,
        '',
        '--- System Prompt (摘要) ---',
        d.prompt.system.slice(0, 400) + (d.prompt.system.length > 400 ? '…' : ''),
        '',
        '--- User Prompt (摘要) ---',
        d.prompt.user.slice(0, 600) + (d.prompt.user.length > 600 ? '…' : ''),
        '',
        '💡 用 LLM 生成 Markdown 后，调用 POST /api/writer/format 排版，POST /api/writer/publish 推草稿箱。',
      )
      return lines.join('\n')
    }

    return null
  }
}
