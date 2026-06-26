import type { FetchResult } from './fetcher.js'
import { complianceRules } from './compliance.js'
import { loadPersona, loadReference, loadStyle } from './config.js'

function summarizeData(fetch: FetchResult) {
  const lines: string[] = [
    `# 数据采集摘要 — ${fetch.name}(${fetch.code})`,
    `文章类型: ${fetch.templateName}`,
    `必需维度: ${fetch.summary.requiredOk}/${fetch.summary.requiredTotal}`,
    `推荐维度: ${fetch.summary.recommendedOk}/${fetch.summary.recommendedTotal}`,
    '',
  ]
  for (const [dim, result] of Object.entries(fetch.dimensions)) {
    if (!result.success) continue
    const preview = JSON.stringify(result.data?.slice(0, 3) ?? [], null, 0)
    lines.push(`## ${dim} (source: ${result.source ?? 'unknown'})`)
    lines.push(preview.slice(0, 800))
    lines.push('')
  }
  return lines.join('\n')
}

export interface WriterPromptOptions {
  persona?: string
  stylePath?: string
  includeReferences?: string[]
}

export function buildWriterPrompt(fetch: FetchResult, opts: WriterPromptOptions = {}) {
  const style = loadStyle(opts.stylePath)
  const personaName = opts.persona ?? style.writing_persona ?? 'retail-voice'
  const persona = loadPersona(personaName)

  const refNames = opts.includeReferences ?? ['compliance-rules', 'writing-guide', 'stock-frameworks']
  const refs = refNames
    .map(n => loadReference(n))
    .filter(Boolean)
    .join('\n\n---\n\n')

  const system = [
    '你是 A 股投研公众号主笔。基于真实数据写作，合规优先。',
    `作者人设: ${persona.name} — ${persona.description ?? ''}`,
    `语气: ${style.tone ?? '专业'} | 人称: ${style.voice ?? '我们'}`,
    `目标读者: ${style.target_audience ?? '有一定经验的投资者'}`,
    '',
    '## 合规硬约束',
    ...complianceRules(style.blacklist ?? []).map(r => `- ${r}`),
    '',
    '## 写作人格参数',
    `- 段落上限: ${persona.paragraph_max_length ?? 120} 字`,
    `- 开场风格: ${persona.opening_style ?? 'data_first'}`,
    `- 避免: ${(persona.avoid ?? []).join('；')}`,
  ].join('\n')

  const user = [
    `请为 ${fetch.name}(${fetch.code}) 撰写一篇「${fetch.templateName}」类型的公众号文章大纲 + 核心段落草稿。`,
    '',
    summarizeData(fetch),
    '',
    '## 参考规范',
    refs.slice(0, 6000),
    '',
    '输出结构: 标题候选(3个) → 大纲(H2) → 首段草稿 → 合规免责声明',
    '',
    '## 排版与发布（Step 7-8）',
    '文章完成后调用 POST /api/writer/format 生成微信 HTML，再 POST /api/writer/publish 推送到草稿箱。',
    '微信凭证配置: ~/.a_stock_layer/writer-config.yaml (wechat.appid, wechat.secret)',
  ].join('\n')

  return {
    system,
    user,
    meta: {
      code: fetch.code,
      name: fetch.name,
      articleType: fetch.articleType,
      persona: personaName,
      styleName: style.name,
    },
  }
}
