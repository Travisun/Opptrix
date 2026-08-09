/**
 * multilingual-e5-small embedding：e5 惯例前缀 query: / passage:；未安装则 isReady=false。
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

function asNumberVector(data: Float32Array | number[], dim: number): number[] {
  const arr = Array.isArray(data) ? data : Array.from(data)
  if (arr.length < dim) {
    throw new Error(`embedding dim mismatch: got ${arr.length}, want ${dim}`)
  }
  return arr.slice(0, dim)
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
    const results: number[][] = []
    for (const text of texts) {
      const prefixed = `passage: ${text.trim()}`
      const out = await this.pipe(prefixed, { pooling: 'mean', normalize: true })
      results.push(asNumberVector(out.data, this.dimensions))
    }
    return results
  }

  async dispose(): Promise<void> {
    this.pipe = null
  }
}

export class EmbeddingService {
  private backend: EmbeddingBackend | null

  constructor(backend: EmbeddingBackend | null = null) {
    this.backend = backend
  }

  setBackend(backend: EmbeddingBackend | null): void {
    this.backend = backend
  }

  getBackend(): EmbeddingBackend | null {
    return this.backend
  }

  isReady(): boolean {
    return this.backend?.isReady() ?? false
  }

  /** 尝试加载默认后端（优先安装包内置）；失败不抛，返回 false */
  async tryEnableDefaultBackend(): Promise<boolean> {
    if (this.backend?.isReady()) return true
    // 已显式注入后端（含「未就绪」假后端）时不自动升格，避免测试/关闭语义检索时仍加载本机模型
    if (this.backend) return false
    if (!isEmbeddingModelInstalled()) return false
    const { dir } = resolveEmbeddingModelDir()
    const backend = new TransformersE5Backend(dir)
    const ok = await backend.ensureLoaded()
    if (!ok) return false
    this.backend = backend
    return true
  }

  async embedQuery(text: string): Promise<number[] | null> {
    if (!this.backend?.isReady()) {
      const enabled = await this.tryEnableDefaultBackend()
      if (!enabled || !this.backend) return null
    }
    try {
      return await this.backend.embedQuery(text)
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
      return await this.backend.embedPassages(texts)
    } catch {
      return null
    }
  }

  /** 释放后端（onnx / transformers）；失败不抛 */
  async dispose(): Promise<void> {
    const backend = this.backend
    this.backend = null
    if (!backend?.dispose) return
    try {
      await backend.dispose()
    } catch {
      /* ignore teardown races */
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
