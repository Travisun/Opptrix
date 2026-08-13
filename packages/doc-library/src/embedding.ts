/**
 * multilingual-e5-small embedding：e5 惯例前缀 query: / passage:；未安装则 isReady=false。
 * 成功 embed 后按空闲超时卸下内存中的模型（磁盘「已安装」保留），下次检索可再 ensureLoaded。
 */
import path from 'node:path'
import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from './paths.js'
import { isEmbeddingModelInstalled, resolveEmbeddingModelDir } from './model-downloader.js'

export interface EmbeddingBackend {
  readonly dimensions: number
  isReady(): boolean
  embedQuery(text: string): Promise<number[]>
  embedPassages(texts: string[]): Promise<number[][]>
  dispose?(): Promise<void>
}

type FeaturePipeline = (
  text: string | string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>

/** 默认 12 分钟；`OPPTRIX_EMBED_IDLE_MS=0` 关闭空闲卸载 */
export const DEFAULT_EMBED_IDLE_MS = 12 * 60 * 1000

/** 真 batch 推理默认批大小；`OPPTRIX_EMBED_BATCH_SIZE` 可调，钳位 8～32 */
export const DEFAULT_EMBED_BATCH_SIZE = 8
export const MIN_EMBED_BATCH_SIZE = 8
export const MAX_EMBED_BATCH_SIZE = 32

export function resolveEmbedIdleMs(): number {
  const raw = process.env.OPPTRIX_EMBED_IDLE_MS
  if (raw == null || raw === '') return DEFAULT_EMBED_IDLE_MS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_EMBED_IDLE_MS
  return n
}

export function resolveEmbedBatchSize(): number {
  const raw = process.env.OPPTRIX_EMBED_BATCH_SIZE
  if (raw == null || raw === '') return DEFAULT_EMBED_BATCH_SIZE
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_EMBED_BATCH_SIZE
  return Math.min(MAX_EMBED_BATCH_SIZE, Math.max(MIN_EMBED_BATCH_SIZE, Math.floor(n)))
}

function asNumberVector(data: Float32Array | number[], dim: number): number[] {
  const arr = Array.isArray(data) ? data : Array.from(data)
  if (arr.length < dim) {
    throw new Error(`embedding dim mismatch: got ${arr.length}, want ${dim}`)
  }
  return arr.slice(0, dim)
}

/** 将 pipeline 批输出（扁平 Float32Array / number[]）拆成 count 条 dim 维向量 */
function splitBatchVectors(
  data: Float32Array | number[],
  count: number,
  dim: number,
): number[][] {
  const arr = Array.isArray(data) ? data : Array.from(data)
  const need = count * dim
  if (arr.length < need) {
    throw new Error(`embedding batch size mismatch: got ${arr.length}, want >= ${need}`)
  }
  const out: number[][] = []
  for (let i = 0; i < count; i++) {
    out.push(asNumberVector(arr.slice(i * dim, (i + 1) * dim), dim))
  }
  return out
}

/** 可注入的假后端（测试） */
export class MockEmbeddingBackend implements EmbeddingBackend {
  readonly dimensions = EMBEDDING_DIM
  private ready: boolean

  constructor(ready = true) {
    this.ready = ready
  }

  setReady(ready: boolean): void {
    this.ready = ready
  }

  isReady(): boolean {
    return this.ready
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.hashEmbed(`query: ${text}`)
  }

  async embedPassages(texts: string[]): Promise<number[][]> {
    return texts.map(t => this.hashEmbed(`passage: ${t}`))
  }

  async dispose(): Promise<void> {
    this.ready = false
  }

  /** 确定性伪向量：保证同文同量、维数正确 */
  private hashEmbed(text: string): number[] {
    const out = new Array<number>(this.dimensions).fill(0)
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      out[i % this.dimensions]! += ((code % 31) + 1) / 32
    }
    let norm = 0
    for (const v of out) norm += v * v
    norm = Math.sqrt(norm) || 1
    return out.map(v => v / norm)
  }
}

export class TransformersE5Backend implements EmbeddingBackend {
  readonly dimensions = EMBEDDING_DIM
  private pipe: FeaturePipeline | null = null
  private loadPromise: Promise<void> | null = null
  private readonly modelDir: string

  constructor(modelDir?: string) {
    this.modelDir = modelDir ?? resolveEmbeddingModelDir().dir
  }

  isReady(): boolean {
    return isEmbeddingModelInstalled(this.modelDir) && this.pipe !== null
  }

  /** 模型文件在磁盘且可加载 */
  async ensureLoaded(): Promise<boolean> {
    if (!isEmbeddingModelInstalled(this.modelDir)) return false
    if (this.pipe) return true
    if (!this.loadPromise) {
      this.loadPromise = this.load().finally(() => {
        this.loadPromise = null
      })
    }
    try {
      await this.loadPromise
      return this.pipe !== null
    } catch {
      this.pipe = null
      return false
    }
  }

  private async load(): Promise<void> {
    const transformers = await import('@huggingface/transformers')
    const { pipeline, env } = transformers
    const modelsRoot = path.dirname(this.modelDir)
    env.localModelPath = modelsRoot
    env.allowRemoteModels = false
    env.allowLocalModels = true

    const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL_ID, {
      local_files_only: true,
      dtype: 'q8',
    })
    this.pipe = extractor as unknown as FeaturePipeline
  }

  async embedQuery(text: string): Promise<number[]> {
    const ok = await this.ensureLoaded()
    if (!ok || !this.pipe) throw new Error('embedding model not ready')
    const prefixed = `query: ${text.trim()}`
    const out = await this.pipe(prefixed, { pooling: 'mean', normalize: true })
    return asNumberVector(out.data, this.dimensions)
  }

  async embedPassages(texts: string[]): Promise<number[][]> {
    const ok = await this.ensureLoaded()
    if (!ok || !this.pipe) throw new Error('embedding model not ready')
    if (!texts.length) return []

    const pipe = this.pipe
    const dim = this.dimensions
    const batchSize = resolveEmbedBatchSize()
    const results: number[][] = []

    for (let i = 0; i < texts.length; i += batchSize) {
      const slice = texts.slice(i, i + batchSize)
      const prefixed = slice.map(t => `passage: ${t.trim()}`)
      try {
        const out = await pipe(prefixed, { pooling: 'mean', normalize: true })
        results.push(...splitBatchVectors(out.data, prefixed.length, dim))
      } catch {
        // 批推理失败则回退逐条，保持语义与维数契约
        for (const p of prefixed) {
          const out = await pipe(p, { pooling: 'mean', normalize: true })
          results.push(asNumberVector(out.data, dim))
        }
      }
    }
    return results
  }

  /** 卸下内存中的 pipeline；磁盘模型仍视为已安装，下次 ensureLoaded 可再加载 */
  async dispose(): Promise<void> {
    this.pipe = null
  }
}

export class EmbeddingService {
  private backend: EmbeddingBackend | null
  private lastUsedAt = 0
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  /** 空闲卸载进行中，避免并发 dispose */
  private idleUnloadPromise: Promise<void> | null = null

  constructor(backend: EmbeddingBackend | null = null) {
    this.backend = backend
  }

  setBackend(backend: EmbeddingBackend | null): void {
    this.clearIdleTimer()
    this.backend = backend
  }

  getBackend(): EmbeddingBackend | null {
    return this.backend
  }

  isReady(): boolean {
    return this.backend?.isReady() ?? false
  }

  getLastUsedAt(): number {
    return this.lastUsedAt
  }

  /**
   * 尝试加载默认后端（优先安装包内置）；失败不抛，返回 false。
   * 空闲卸载后 backend=null，可再次 enable；显式注入的 Mock 仍不自动升格。
   * TransformersE5Backend 在 pipe 已卸但实例仍挂着时，允许再 ensureLoaded。
   */
  async tryEnableDefaultBackend(): Promise<boolean> {
    if (this.backend?.isReady()) return true
    // 空闲卸 pipe 后实例仍在：允许再加载，避免 isReady=false 且 if (backend) return false 卡住
    if (this.backend instanceof TransformersE5Backend) {
      const ok = await this.backend.ensureLoaded()
      if (ok) this.touchLastUsed()
      return ok
    }
    // 已显式注入后端（含「未就绪」假后端）时不自动升格，避免测试/关闭语义检索时仍加载本机模型
    if (this.backend) return false
    if (!isEmbeddingModelInstalled()) return false
    const { dir } = resolveEmbeddingModelDir()
    const backend = new TransformersE5Backend(dir)
    const ok = await backend.ensureLoaded()
    if (!ok) return false
    this.backend = backend
    this.touchLastUsed()
    return true
  }

  async embedQuery(text: string): Promise<number[] | null> {
    if (!this.backend?.isReady()) {
      const enabled = await this.tryEnableDefaultBackend()
      if (!enabled || !this.backend) return null
    }
    try {
      const vec = await this.backend.embedQuery(text)
      this.touchLastUsed()
      return vec
    } catch {
      return null
    }
  }

  async embedPassages(texts: string[]): Promise<number[][] | null> {
    if (!texts.length) return []
    if (!this.backend?.isReady()) {
      const enabled = await this.tryEnableDefaultBackend()
      if (!enabled || !this.backend) return null
    }
    try {
      const vecs = await this.backend.embedPassages(texts)
      this.touchLastUsed()
      return vecs
    } catch {
      return null
    }
  }

  /**
   * 空闲卸载：dispose 当前后端并 setBackend(null)，下次 tryEnable / embed 可再加载。
   * 注入的 Mock 亦会卸下；测试可再 setBackend，或依赖 tryEnableDefaultBackend。
   */
  async releaseLoadedModel(): Promise<void> {
    this.clearIdleTimer()
    const backend = this.backend
    this.backend = null
    if (!backend?.dispose) return
    try {
      await backend.dispose()
    } catch {
      /* ignore teardown races */
    }
  }

  /** 释放后端（onnx / transformers）并取消空闲定时器；失败不抛 */
  async dispose(): Promise<void> {
    this.clearIdleTimer()
    const pending = this.idleUnloadPromise
    this.idleUnloadPromise = null
    if (pending) {
      try {
        await pending
      } catch {
        /* ignore */
      }
    }
    const backend = this.backend
    this.backend = null
    if (!backend?.dispose) return
    try {
      await backend.dispose()
    } catch {
      /* ignore teardown races */
    }
  }

  private touchLastUsed(): void {
    this.lastUsedAt = Date.now()
    this.scheduleIdleUnload()
  }

  private scheduleIdleUnload(): void {
    this.clearIdleTimer()
    const idleMs = resolveEmbedIdleMs()
    if (idleMs <= 0) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      void this.runIdleUnload()
    }, idleMs)
    // 不阻塞进程退出
    if (typeof this.idleTimer === 'object' && this.idleTimer && 'unref' in this.idleTimer) {
      this.idleTimer.unref()
    }
  }

  private async runIdleUnload(): Promise<void> {
    if (this.idleUnloadPromise) {
      await this.idleUnloadPromise
      return
    }
    this.idleUnloadPromise = this.releaseLoadedModel().finally(() => {
      this.idleUnloadPromise = null
    })
    await this.idleUnloadPromise
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }
}

let sharedEmbedding: EmbeddingService | null = null

export function getEmbeddingService(): EmbeddingService {
  if (!sharedEmbedding) sharedEmbedding = new EmbeddingService()
  return sharedEmbedding
}

/** 关闭共享 embedding 单例（若已打开）；未打开则 no-op */
export async function closeEmbeddingService(): Promise<void> {
  const svc = sharedEmbedding
  sharedEmbedding = null
  if (!svc) return
  await svc.dispose()
}

export function setEmbeddingServiceForTests(svc: EmbeddingService | null): void {
  sharedEmbedding = svc
}
