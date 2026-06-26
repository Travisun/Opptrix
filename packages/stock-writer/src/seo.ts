import { checkCompliance } from './compliance.js'
import { loadReference } from './config.js'
import type { ConvertResult } from './formatter.js'

export interface SeoMeta {
  titleCandidates: string[]
  digest: string
  tags: string[]
  rules: string
}

export interface PreflightResult {
  ok: boolean
  checks: { name: string; pass: boolean; detail?: string }[]
}

export function buildSeoMeta(
  convert: ConvertResult,
  context: { industry?: string; articleType?: string } = {},
): SeoMeta {
  const industry = context.industry ?? 'A股'
  const type = context.articleType ?? '投研'
  const base = convert.title || `${industry}观察`
  const titleCandidates = [
    base,
    `从数据看${industry}：${type}视角`,
    `${industry}行业正在经历的几个变化`,
  ]
  const tags = [
    industry.slice(0, 8),
    context.articleType?.includes('链') ? '产业链分析' : '财报解读',
    '投资思考',
    '市场观察',
    'A股',
  ].slice(0, 5)

  return {
    titleCandidates,
    digest: convert.digest,
    tags,
    rules: loadReference('seo-rules').slice(0, 2000),
  }
}

export function validatePublishPreflight(markdown: string, convert: ConvertResult): PreflightResult {
  const compliance = checkCompliance(markdown)
  const checks = [
    { name: 'H1 标题', pass: !!convert.title, detail: convert.title || '缺少 # 标题' },
    { name: '摘要长度', pass: convert.digest.length <= 120, detail: `${convert.digest.length} 字符` },
    { name: '正文字数', pass: convert.wordCount >= 200, detail: `${convert.wordCount} 字` },
    { name: '图片数量', pass: convert.images.length <= 10, detail: `${convert.images.length} 张` },
    { name: '合规审查', pass: compliance.ok, detail: compliance.violations.join('、') || '通过' },
    { name: '免责声明', pass: /免责声明|风险提示|不构成投资建议/.test(markdown), detail: '需包含免责声明段落' },
  ]
  return { ok: checks.every(c => c.pass), checks }
}

export function seoPromptSection(meta: SeoMeta) {
  return [
    '## SEO 要求（Step 6）',
    `- 备选标题: ${meta.titleCandidates.join(' | ')}`,
    `- 摘要(≤54字): ${meta.digest}`,
    `- 推荐标签: ${meta.tags.join('、')}`,
    meta.rules ? `\n${meta.rules.slice(0, 1500)}` : '',
  ].join('\n')
}
