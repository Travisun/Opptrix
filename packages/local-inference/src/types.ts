export type ModelPurpose = 'translation' | 'vision' | 'vision_mmproj' | 'speech'

export type CatalogModel = {
  id: string
  name: string
  filename: string
  urls: DownloadSource[]
  sizeBytes: number
  family: string
  purpose: ModelPurpose
  recommended?: boolean
  /** vision 主模型需配对的 mmproj catalog id */
  pairsWith?: string
}

export type DownloadSource = {
  source: string
  label: string
  url: string
}

export type DownloadProgress = {
  modelId: string
  filename: string
  receivedBytes: number
  totalBytes: number
  status: 'downloading' | 'completed' | 'error'
  filePath?: string
  error?: string
  source?: string
  sourceLabel?: string
}

export type TextGenerationOptions = {
  maxTokens?: number
  temperature?: number
  topK?: number
  topP?: number
  repeatPenalty?: number
}

export type WhisperSegment = {
  text: string
  start?: number
  end?: number
}
