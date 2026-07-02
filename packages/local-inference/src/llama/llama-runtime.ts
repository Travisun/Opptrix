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

let llamaModule: LlamaModule | null = null
let chatSession: InstanceType<LlamaModule['LlamaChatSession']> | null = null
let loadedModelPath: string | null = null
let loadingPromise: Promise<void> | null = null

async function getLlamaModule(): Promise<LlamaModule> {
  if (!llamaModule) {
    llamaModule = await import('node-llama-cpp')
  }
  return llamaModule
}

async function ensureTextSession(modelPath: string): Promise<InstanceType<LlamaModule['LlamaChatSession']>> {
  if (chatSession && loadedModelPath === modelPath) {
    return chatSession
  }

  if (loadingPromise) {
    await loadingPromise
    if (!chatSession) throw new Error('翻译模型加载失败')
    return chatSession
  }

  loadingPromise = (async () => {
    const { getLlama, LlamaChatSession } = await getLlamaModule()
    const llama = await getLlama()
    const model = await llama.loadModel({
      modelPath,
      gpuLayers: process.platform === 'darwin' ? 'max' : 'auto',
    })
    const context = await model.createContext({ contextSize: 3072, threads: 0 })
    chatSession = new LlamaChatSession({ contextSequence: context.getSequence() })
    loadedModelPath = modelPath
  })()

  try {
    await loadingPromise
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
      if (isHtml) {
        return cleanHtmlTranslationOutput(raw, sourceText) || String(raw ?? '').trim()
      }
      return cleanBlockTranslationOutput(raw, sourceText) || String(raw ?? '').trim()
    })
  }

  async unload(): Promise<void> {
    chatSession = null
    loadedModelPath = null
    loadingPromise = null
  }
}

export const llamaRuntime = new LlamaRuntime()
