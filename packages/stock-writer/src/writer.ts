import type { AshareEngine } from '@ni-k/a-stock-layer'
import type { ArticleType } from './templates.js'
import { fetchArticleData } from './fetcher.js'
import { buildWriterPrompt, type WriterPromptOptions } from './prompt.js'
import { checkCompliance } from './compliance.js'
import { listPersonas, listReferences, loadStyle } from './config.js'
import { formatArticle, publishArticle } from './publish.js'

export class StockWriter {
  constructor(private engine: AshareEngine) {}

  async prepare(code: string, articleType: ArticleType = 'value', promptOpts?: WriterPromptOptions) {
    const data = await fetchArticleData(this.engine, code, articleType)
    const prompt = buildWriterPrompt(data, promptOpts)
    return { data, prompt }
  }

  format(markdown: string, theme?: string) {
    return formatArticle(markdown, theme)
  }

  async publish(markdown: string, opts: Omit<Parameters<typeof publishArticle>[0], 'markdown'> = {}) {
    return publishArticle({ markdown, ...opts })
  }

  validateText(text: string, blacklist?: string[]) {
    const style = loadStyle()
    return checkCompliance(text, [...(style.blacklist ?? []), ...(blacklist ?? [])])
  }

  listPersonas() { return listPersonas() }
  listReferences() { return listReferences() }
  getStyle() { return loadStyle() }
}

export { fetchArticleData, buildWriterPrompt, checkCompliance, listPersonas, listReferences, loadStyle }
export { formatArticle, publishArticle, loadWriterConfig, saveWriterConfig, wechatConfigured } from './publish.js'
export { formatMarkdownToWechat, wrapPreviewHtml } from './formatter.js'
export { buildSeoMeta, validatePublishPreflight, seoPromptSection } from './seo.js'
export { listThemes, loadTheme } from './theme.js'
export { listHistory } from './history.js'
