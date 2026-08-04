import type { AttachmentLimits, MediaKind } from './media-types.js'

const MB = 1024 * 1024

const DEFAULT_BY_KIND: Partial<Record<MediaKind, number>> = {
  image: 10 * MB,
  pdf: 20 * MB,
  video: 50 * MB,
  audio: 25 * MB,
}

const DEFAULT_MAX_COUNT = 5
const DEFAULT_MAX_TOTAL = 80 * MB

interface LimitTier {
  test: (modelId: string) => boolean
  maxBytesByKind: Partial<Record<MediaKind, number>>
  maxCount: number
  maxTotalBytes: number
}

const LIMIT_TIERS: LimitTier[] = [
  {
    test: id => /\bgpt-4o\b|\bgpt-4\.1\b|\bgpt-5/i.test(id) || /\bo[34](?:-mini)?\b/i.test(id),
    maxBytesByKind: { image: 20 * MB, pdf: 32 * MB, video: 100 * MB, audio: 50 * MB },
    maxCount: 10,
    maxTotalBytes: 150 * MB,
  },
  {
    test: id => /claude|anthropic/i.test(id),
    maxBytesByKind: { image: 5 * MB, pdf: 32 * MB, video: 50 * MB, audio: 25 * MB },
    maxCount: 5,
    maxTotalBytes: 60 * MB,
  },
  {
    test: id => /gemini/i.test(id),
    maxBytesByKind: { image: 20 * MB, pdf: 50 * MB, video: 200 * MB, audio: 50 * MB },
    maxCount: 10,
    maxTotalBytes: 250 * MB,
  },
  {
    test: id => /glm-v|glm-4\.5v|glm-4\.6v|glm-5v/i.test(id),
    maxBytesByKind: { image: 10 * MB, pdf: 20 * MB, video: 100 * MB, audio: 25 * MB },
    maxCount: 6,
    maxTotalBytes: 120 * MB,
  },
  {
    test: id => /qwen-vl|qwen3\.6|qwen3\.5|qwen-v|deepseek-vl/i.test(id),
    maxBytesByKind: { image: 10 * MB, pdf: 20 * MB, video: 80 * MB, audio: 25 * MB },
    maxCount: 6,
    maxTotalBytes: 100 * MB,
  },
]

function pickTier(modelId: string): LimitTier | null {
  const id = modelId.toLowerCase()
  for (const tier of LIMIT_TIERS) {
    if (tier.test(id)) return tier
  }
  return null
}

function filterLimitsForModalities(
  base: Partial<Record<MediaKind, number>>,
  inputModalities: MediaKind[],
): Partial<Record<MediaKind, number>> {
  const out: Partial<Record<MediaKind, number>> = {}
  for (const kind of inputModalities) {
    if (kind === 'text') continue
    const cap = base[kind] ?? DEFAULT_BY_KIND[kind]
    if (cap) out[kind] = cap
  }
  // PDF 始终可走本地文本整理，限额独立保留
  out.pdf = base.pdf ?? DEFAULT_BY_KIND.pdf
  return out
}

/** 按模型族与 modalities.input 动态分档附件限额 */
export function resolveAttachmentLimits(
  modelId: string,
  inputModalities: MediaKind[],
): AttachmentLimits {
  const tier = pickTier(modelId)
  const maxBytesByKind = filterLimitsForModalities(
    tier?.maxBytesByKind ?? DEFAULT_BY_KIND,
    inputModalities,
  )
  return {
    maxBytesByKind,
    maxCount: tier?.maxCount ?? DEFAULT_MAX_COUNT,
    maxTotalBytes: tier?.maxTotalBytes ?? DEFAULT_MAX_TOTAL,
  }
}
