import type { AttachmentLimits, MediaKind } from './media-types.js'
import { isLibraryIngestKind, isTranscriptExtractKind } from './media-types.js'

const MB = 1024 * 1024

/** 超过此大小时 UI 应提示「处理可能更久」并确认后再上传（非硬上限） */
export const LARGE_FILE_WARN_BYTES = 500 * MB

/** 本地研报入库 / 音视频转写路径的宽松附件数量上限 */
const LOCAL_PATH_MAX_COUNT = 50

/** 模型原生多模态（非本地路径）的保守默认；本地路径不走硬字节上限 */
const DEFAULT_BY_KIND: Partial<Record<MediaKind, number>> = {
  // canvas / mindmap 等制品不设默认字节上限
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
    maxBytesByKind: {},
    maxCount: 10,
    maxTotalBytes: 150 * MB,
  },
  {
    test: id => /claude|anthropic/i.test(id),
    maxBytesByKind: {},
    maxCount: 5,
    maxTotalBytes: 60 * MB,
  },
  {
    test: id => /gemini/i.test(id),
    maxBytesByKind: {},
    maxCount: 10,
    maxTotalBytes: 250 * MB,
  },
  {
    test: id => /glm-v|glm-4\.5v|glm-4\.6v|glm-5v/i.test(id),
    maxBytesByKind: {},
    maxCount: 6,
    maxTotalBytes: 120 * MB,
  },
  {
    test: id => /qwen-vl|qwen3\.6|qwen3\.5|qwen-v|deepseek-vl/i.test(id),
    maxBytesByKind: {},
    maxCount: 6,
    maxTotalBytes: 100 * MB,
  },
]

function isLocalPathKind(kind: MediaKind): boolean {
  return isLibraryIngestKind(kind) || isTranscriptExtractKind(kind)
}

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
    // 本地路径（研报入库 / 转写）不设硬字节上限
    if (isLocalPathKind(kind)) continue
    const cap = base[kind] ?? DEFAULT_BY_KIND[kind]
    if (cap) out[kind] = cap
  }
  return out
}

/** 按模型族与 modalities.input 动态分档附件限额（本地路径 kind 无硬字节上限） */
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
    maxCount: Math.max(tier?.maxCount ?? DEFAULT_MAX_COUNT, LOCAL_PATH_MAX_COUNT),
    // maxTotal 仅约束非本地路径；本地路径在 validate 中跳过
    maxTotalBytes: tier?.maxTotalBytes ?? DEFAULT_MAX_TOTAL,
  }
}
