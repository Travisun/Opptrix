export interface CoreModelStatusItem {
  id: string
  label: string
  ready: boolean
  pathHint: string
}

export interface CoreModelsCatalogStatus {
  required: string[]
  items: CoreModelStatusItem[]
  allReady: boolean
  sourceOrder: string[]
  mirrors: Array<{ id: string; label: string }>
}

export interface CoreModelsSharedModule {
  CORE_MODEL_IDS: string[]
  buildCoreModelsStatus: (modelsDir?: string) => CoreModelsCatalogStatus
  resolveEffectiveSourceOrder: (preferenceOrder?: string[]) => string[]
  normalizeSourceOrderInput: (order: unknown) => string[] | null
  ensureAllCoreModels: (opts?: {
    logPrefix?: string
    sourceOrder?: string[]
    includeOptional?: boolean
    onProgress?: (p: {
      modelId: string
      phase: string
      message?: string
      fileName?: string
      fileIndex?: number
      fileCount?: number
      bytesReceived?: number
      bytesTotal?: number | null
      modelRatio?: number
    }) => void
  }) => Promise<void>
  isCoreModelReady: (modelId: string, modelsDir?: string) => boolean
  validateImportBuffer: (
    modelId: string,
    buf: Buffer,
    filename: string,
  ) => { ok: boolean; error?: string }
  mapImportDest: (modelId: string, filename: string, modelsDir?: string) => string | null
  writeImportFile: (destPath: string, buf: Buffer) => Promise<void>
  isZipFilename: (name: string) => boolean
  isGgufFilename: (name: string) => boolean
  isGgufBuffer: (buf: Buffer) => boolean
}
