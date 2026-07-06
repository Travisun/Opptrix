import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { CNINFO_SETTINGS } from './settings.js'
import {
  cnEquityBindings,
} from '../common/bindings.js'

export const CNINFO_CAPS = [
  Capability.NEWS,
]

export const CNINFO_SPEC: ProviderManifestSpec = {
  id: 'cninfo',
  title: '巨潮资讯',
  subtitle: '法定披露公告 · 代用户浏览（支持分类/日期/PDF 链接 · 限速 2 秒/次）',
  marketGroup: 'CN',
  defaultPriority: 92,
  maxConcurrent: 3,
  capabilities: CNINFO_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityBindings(CNINFO_CAPS, p, maxConcurrent),
  settings: CNINFO_SETTINGS,
  supportsTest: true,
}

export const CNINFO_MANIFEST = providerManifestEntry(
  'cninfo',
  '巨潮资讯',
  '法定披露公告 · 代用户浏览（支持分类/日期/PDF 链接 · 限速 2 秒/次）',
  'CN',
  92,
  CNINFO_SETTINGS,
)
