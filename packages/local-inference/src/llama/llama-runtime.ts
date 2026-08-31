import { globalInferenceQueue } from '../runtime/job-queue.js'
import {
  buildHtmlTranslatePrompt,
  buildTranslatePrompt,
  cleanBlockTranslationOutput,
  cleanHtmlTranslationOutput,
  estimateHtmlMaxTokens,
  estimateMaxTokens,
} from './prompts.js'
import { resolveTranslationModelPath } from '../catalog/installed.js'

type LlamaModule = typeof import('node-llama-cpp')

type DisposableHandle = {
  dispose?: (opts?: { disposeSequence?: boolean }) => void | Promise<void>
  disposed?: boolean
}

export type LlamaHeldHandles = {
  session: DisposableHandle | null
  context: DisposableHandle | null
  model: DisposableHandle | null
}

/** 对齐 Electron translation-service：默认 12 分钟空闲卸载；`OPPTRIX_TRANSLATION_IDLE_MS=0` 关闭 */
export const DEFAULT_TRANSLATION_IDLE_MS = 12 * 60 * 1000

let llamaModule: LlamaModule | null = null
let chatSession: InstanceType<LlamaModule['LlamaChatSession']> | null = null
let llamaContext: DisposableHandle | null = null
let llamaModel: DisposableHandle | null = null
let loadedModelPath: string | null = null
let loadingPromise: Promise<void> | null = null
/** @type {ReturnType<typeof setTimeout> | null} */
let idleTimer: ReturnType<typeof setTimeout> | null = null
let idleUnloadPromise: Promise<void> | null = null
let lastUsedAt = 0

export function resolveTranslationIdleMs(): number {
  const raw = process.env.OPPTRIX_TRANSLATION_IDLE_MS
  if (raw == null || raw === '') return DEFAULT_TRANSLATION_IDLE_MS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TRANSLATION_IDLE_MS
  return n
}

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function scheduleIdleUnload(): void {
  clearIdleTimer()
  const idleMs = resolveTranslationIdleMs()
  if (idleMs <= 0) return
  idleTimer = setTimeout(() => {
    idleTimer = null
    void runIdleUnload()
  }, idleMs)
  if (typeof idleTimer === 'object' && idleTimer && 'unref' in idleTimer) {
    idleTimer.unref()
  }
}

function touchLastUsed(): void {
  lastUsedAt = Date.now()
  scheduleIdleUnload()
}

async function runIdleUnload(): Promise<void> {
  if (idleUnloadPromise) {
    await idleUnloadPromise
    return
  }
  idleUnloadPromise = unloadHeldResources()
    .catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[llama-runtime] idle unload failed:', msg)
    })
    .finally(() => {
      idleUnloadPromise = null
    })
  await idleUnloadPromise
}

async function getLlamaModule(): Promise<LlamaModule> {
  if (!llamaModule) {
    llamaModule = await import('node-llama-cpp')
  }
  return llamaModule
}

/**
 * 按 node-llama-cpp 官方顺序释放：session → context → model。
 * 任一 dispose 失败不抛，避免卸载半状态阻断后续加载。
 */
export async function disposeLlamaHandles(handles: LlamaHeldHandles): Promise<void> {
  const { session, context, model } = handles
  const run = async (label: string, fn: () => void | Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[llama-runtime] ${label} dispose failed:`, msg)
    }
  }

  if (session && typeof session.dispose === 'function' && !session.disposed) {
    await run('session', () => session.dispose!({ disposeSequence: true }))
  }
  if (context && typeof context.dispose === 'function' && !context.disposed) {
    await run('context', () => context.dispose!())
  }
  if (model && typeof model.dispose === 'function' && !model.disposed) {
    await run('model', () => model.dispose!())
  }
}

function clearHeldRefs(): void {
  chatSession = null
  llamaContext = null
  llamaModel = null
  loadedModelPath = null
}

/** 释放当前句柄并清空引用；不碰 loadingPromise（加载协程内可安全调用） */
async function unloadHeldResources(): Promise<void> {
  clearIdleTimer()
  const handles: LlamaHeldHandles = {
    session: chatSession,
    context: llamaContext,
    model: llamaModel,
  }
  clearHeldRefs()
  await disposeLlamaHandles(handles)
}

async function ensureTextSession(modelPath: string): Promise<InstanceType<LlamaModule['LlamaChatSession']>> {
  // 串行化加载/换模：等待进行中的加载后再判断是否命中缓存
  for (;;) {
    if (chatSession && loadedModelPath === modelPath) {
      touchLastUsed()
      return chatSession
    }
    if (loadingPromise) {
      await loadingPromise
      continue
    }
    break
  }

  loadingPromise = (async () => {
    if (idleUnloadPromise) {
      try {
        await idleUnloadPromise
      } catch {
        /* ignore */
      }
    }
    // 换模或残留句柄：先真正 dispose，再 load
    if (chatSession || llamaContext || llamaModel || loadedModelPath) {
      await unloadHeldResources()
    }

    const { getLlama, LlamaChatSession } = await getLlamaModule()
    const llama = await getLlama()
    let model: DisposableHandle | null = null
    let context: DisposableHandle | null = null
    try {
      const loaded = await llama.loadModel({
        modelPath,
        gpuLayers: process.platform === 'darwin' ? 'max' : 'auto',
      })
      model = loaded
      const created = await loaded.createContext({ contextSize: 3072, threads: 0 })
      context = created
      const session = new LlamaChatSession({ contextSequence: created.getSequence() })
      llamaModel = model
      llamaContext = context
      chatSession = session
      loadedModelPath = modelPath
      // 所有权已移交模块级引用，避免 finally 重复 dispose
      model = null
      context = null
      touchLastUsed()
    } catch (err) {
      await disposeLlamaHandles({ session: null, context, model })
      throw err
    }
  })()

  try {
    await loadingPromise
  } catch (err) {
    // 加载失败时清理可能已创建的半成品句柄
    await unloadHeldResources()
    throw err
  } finally {
    loadingPromise = null
  }

  if (!chatSession) throw new Error('翻译模型加载失败')
  return chatSession
}

export class LlamaRuntime {
  async translateSegment(
    sourceText: string,
    targetLang = 'Chinese',
    kind: 'text' | 'html' = 'text',
    repoRoot?: string,
    preferredModel = '__auto__',
  ): Promise<string> {
    return globalInferenceQueue.enqueue(async () => {
      const modelPath = resolveTranslationModelPath(repoRoot, preferredModel)
      if (!modelPath) throw new Error('未找到本地翻译模型')

      const session = await ensureTextSession(modelPath)
      session.resetChatHistory()
      const isHtml = kind === 'html'
      const prompt = isHtml
        ? buildHtmlTranslatePrompt(sourceText, targetLang)
        : buildTranslatePrompt(sourceText, targetLang)
      const maxTokens = isHtml ? estimateHtmlMaxTokens(sourceText) : estimateMaxTokens(sourceText)
      const raw = await session.prompt(prompt, {
        maxTokens,
        temperature: 0.7,
        topK: 20,
        topP: 0.6,
        repeatPenalty: { penalty: 1.05, frequencyPenalty: 0, presencePenalty: 0 },
      })
      touchLastUsed()
      if (isHtml) {
        return cleanHtmlTranslationOutput(raw, sourceText) || String(raw ?? '').trim()
      }
      return cleanBlockTranslationOutput(raw, sourceText) || String(raw ?? '').trim()
    })
  }

  getLoadedModelPath(): string | null {
    return loadedModelPath
  }

  isLoading(): boolean {
    return Boolean(loadingPromise)
  }

  /** 真正 dispose model/context/session；仅置 null 会导致托盘长驻泄漏 VRAM/RAM */
  async unload(): Promise<void> {
    clearIdleTimer()
    const pending = idleUnloadPromise
    idleUnloadPromise = null
    if (pending) {
      try {
        await pending
      } catch {
        /* ignore */
      }
    }
    if (loadingPromise) {
      try {
        await loadingPromise
      } catch {
        /* ignore load failure during teardown */
      }
    }
    loadingPromise = null
    await unloadHeldResources()
  }

  /** @internal 测试用：注入已加载句柄 */
  __setHeldForTests(handles: {
    session?: DisposableHandle | null
    context?: DisposableHandle | null
    model?: DisposableHandle | null
    modelPath?: string | null
  }): void {
    chatSession = (handles.session ?? null) as typeof chatSession
    llamaContext = handles.context ?? null
    llamaModel = handles.model ?? null
    loadedModelPath = handles.modelPath ?? null
  }

  /** @internal */
  __getLoadedPathForTests(): string | null {
    return loadedModelPath
  }

  /** @internal */
  __touchLastUsedForTests(): void {
    touchLastUsed()
  }

  /** @internal */
  __getLastUsedAtForTests(): number {
    return lastUsedAt
  }
}

export const llamaRuntime = new LlamaRuntime()
