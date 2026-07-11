import type { CatalogModel } from '../types.js'

const HF_MIRROR = String(process.env.OPPTRIX_HF_MIRROR ?? 'https://hf-mirror.com').replace(/\/$/, '')
const HF_OFFICIAL = 'https://huggingface.co'

function buildHfResolveUrl(base: string, repo: string, filename: string): string {
  return `${base}/${repo}/resolve/main/${filename}?download=true`
}

function buildHfDownloadUrls(repo: string, filename: string): CatalogModel['urls'] {
  return [
    {
      source: 'hf-mirror',
      label: 'HF 镜像',
      url: buildHfResolveUrl(HF_MIRROR, repo, filename),
    },
    {
      source: 'huggingface',
      label: 'Hugging Face',
      url: buildHfResolveUrl(HF_OFFICIAL, repo, filename),
    },
  ]
}

export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: 'hy-mt-q4',
    name: 'HY-MT1.5-1.8B Q4_K_M',
    filename: 'HY-MT1.5-1.8B-Q4_K_M.gguf',
    urls: buildHfDownloadUrls('tencent/HY-MT1.5-1.8B-GGUF', 'HY-MT1.5-1.8B-Q4_K_M.gguf'),
    sizeBytes: 1_133_080_512,
    family: 'hy-mt',
    purpose: 'translation',
    recommended: true,
  },
  {
    id: 'hy-mt-q8',
    name: 'HY-MT1.5-1.8B Q8_0',
    filename: 'HY-MT1.5-1.8B-Q8_0.gguf',
    urls: buildHfDownloadUrls('tencent/HY-MT1.5-1.8B-GGUF', 'HY-MT1.5-1.8B-Q8_0.gguf'),
    sizeBytes: 1_908_528_288,
    family: 'hy-mt',
    purpose: 'translation',
  },
]

/** 启用离线翻译时后台预拉 HY-MT（仅翻译模型） */
export const TRANSLATION_BOOTSTRAP_MODEL_IDS = ['hy-mt-q4'] as const

/** @deprecated 使用 TRANSLATION_BOOTSTRAP_MODEL_IDS */
export const BOOTSTRAP_MODEL_IDS = TRANSLATION_BOOTSTRAP_MODEL_IDS

export function getCatalogModel(modelId: string): CatalogModel | undefined {
  return MODEL_CATALOG.find(item => item.id === modelId)
}

export function getDefaultDownloadSourceLabel(): string {
  return HF_MIRROR.includes('hf-mirror') ? 'HF 镜像（hf-mirror）' : HF_MIRROR
}

export function getCatalogPurposeLabel(purpose: CatalogModel['purpose']): string {
  if (purpose === 'vision' || purpose === 'vision_mmproj') return '视觉理解'
  if (purpose === 'speech') return '语音转写'
  return '文本翻译'
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '未知大小'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}
