import fs from 'node:fs'
import path from 'node:path'
import { getUserDataStore } from '@opptrix/user-store'
import type { NewsEnrichmentSettings } from '@opptrix/news-feed'
import { buildImageDescribePrompt } from '@opptrix/local-inference'
import { cleanVisionOutput } from '@opptrix/local-inference'

const APP_CONFIG_NS = 'app_config'
const APP_CONFIG_ID = 'default'

export type RemoteVisionLlm = {
  baseUrl: string
  apiKey: string
  model: string
  providerName: string
}

type StoredProvider = {
  id: string
  name: string
  base_url: string
  api_key: string
  models: string[]
}

type StoredAppConfig = {
  providers?: StoredProvider[]
}

function guessImageMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.bmp') return 'image/bmp'
  return 'image/jpeg'
}

function imageToDataUrl(filePath: string): string {
  const buf = fs.readFileSync(filePath)
  const mime = guessImageMime(filePath)
  return `data:${mime};base64,${buf.toString('base64')}`
}

export function resolveRemoteVisionLlm(settings: NewsEnrichmentSettings): RemoteVisionLlm | null {
  const providerId = settings.remote_provider_id
  const model = settings.remote_model?.trim()
  if (!providerId || !model) return null

  const cfg = getUserDataStore().getDocument<StoredAppConfig>(APP_CONFIG_NS, APP_CONFIG_ID)
  const provider = cfg?.providers?.find(p => p.id === providerId)
  if (!provider?.api_key || !provider.base_url) return null

  return {
    baseUrl: provider.base_url,
    apiKey: provider.api_key,
    model,
    providerName: provider.name,
  }
}

export async function extractImageWithRemoteLlm(
  imagePath: string,
  llm: RemoteVisionLlm,
  articleTitle?: string,
): Promise<string> {
  if (!fs.existsSync(imagePath)) {
    throw new Error('图片文件不存在')
  }

  const prompt = buildImageDescribePrompt(articleTitle)
  const url = `${llm.baseUrl.replace(/\/$/, '')}/chat/completions`
  const dataUrl = imageToDataUrl(imagePath)

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.2,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 240)
    throw new Error(
      resp.status === 400
        ? '远程模型可能不支持图片输入，请在设置中换用支持视觉的多模态模型（如 GPT-4o、Qwen-VL、GLM-4V 等）'
        : `远程图片理解失败 HTTP ${resp.status}: ${detail}`,
    )
  }

  const data = await resp.json() as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const raw = String(data.choices?.[0]?.message?.content ?? '').trim()
  if (!raw) {
    throw new Error('远程模型未返回图片内容')
  }

  return cleanVisionOutput(raw, prompt) || raw
}
