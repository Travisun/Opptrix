import type { CustomMethodApiDoc } from '../common/custom-method-doc-types.js'
import { toCustomMethodDef } from '../common/custom-method-doc-types.js'

/** OpptrixQuant 仅提供标的搜索；行情/净值/名录等自定义方法已下线 */
export const STOCKINDEX_METHOD_DOCS: Record<string, CustomMethodApiDoc> = {}

export const STOCKINDEX_CUSTOM = Object.values(STOCKINDEX_METHOD_DOCS).map(toCustomMethodDef)
