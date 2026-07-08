import type { CustomMethodParam } from '../../core/custom-methods.js'

export type { CustomMethodParam }

/**
 * Provider 自定义方法完整 API 文档 — 供 MCP 注册、ext.ts JSDoc 与维护者对照上游。
 */
export interface CustomMethodApiDoc {
  /** Driver 方法名 */
  method: string
  /** 功能摘要 */
  description: string
  /** 上游数据接口 URL（含 host + path；query 见 params / notes） */
  sourceUrl: string
  /** 产品页面入口（mstats / 新浪 F10 / 基金详情等） */
  pageUrl?: string
  /** 入参 Schema */
  params: CustomMethodParam[]
  /** 返回值结构说明（成功时 `invokeCustomMethod` 的 `data` 形态） */
  returns: string
  /** 调用方式（引擎 / JSON 示例） */
  usage: string
  /** 维护备注：Referer、分页、失效、延迟行情等 */
  notes?: string
  /** JSON 调用示例 */
  example?: string
}

/** 将完整文档转为 MCP 注册用的精简定义（保留扩展字段供 list 工具展示） */
export function toCustomMethodDef(doc: CustomMethodApiDoc) {
  return {
    method: doc.method,
    description: doc.description,
    params: doc.params,
    sourceUrl: doc.sourceUrl,
    pageUrl: doc.pageUrl,
    returns: doc.returns,
    usage: doc.usage,
    notes: doc.notes,
    example: doc.example,
  }
}

/** 生成 ext.ts 挂载方法用的 JSDoc 正文（不含首尾 `/**`） */
export function formatCustomMethodJSDoc(doc: CustomMethodApiDoc): string {
  const paramLines = doc.params.map(p => {
    const req = p.required ? '（必填）' : '（可选）'
    const def = p.default != null ? `，默认 ${JSON.stringify(p.default)}` : ''
    return `@param ${p.name} ${p.description}${req}${def}`
  })
  const lines = [
    doc.description,
    `@sourceUrl ${doc.sourceUrl}`,
    doc.pageUrl ? `@pageUrl ${doc.pageUrl}` : '',
    `@returns ${doc.returns}`,
    `@usage ${doc.usage}`,
    doc.notes ? `@remarks ${doc.notes}` : '',
    ...paramLines,
    doc.example ? `@example ${doc.example}` : '',
  ].filter(Boolean)
  return lines.map(l => ` * ${l}`).join('\n')
}

/** 包装为完整 JSDoc 块 */
export function wrapCustomMethodJSDoc(doc: CustomMethodApiDoc): string {
  return `/**\n${formatCustomMethodJSDoc(doc)}\n */`
}
