import fs from 'node:fs'
import path from 'node:path'
import { globalInferenceQueue } from '../runtime/job-queue.js'
import {
  ensureDirAsync,
  getSenseVoiceModelsDir,
  listSenseVoiceModelSearchDirs,
  resolveSenseVoiceAssetInSearchDirs,
  type SenseVoiceAssetSource,
} from '../paths.js'
import type { WhisperSegment } from '../types.js'
import {
  downloadSenseVoiceModelFile,
  downloadSenseVoiceVadFile,
  getSenseVoiceVadFilename,
  resolveSenseVoiceModelFilename,
} from './sensevoice-download.js'
import { ensureSenseVoiceRuntime } from './ensure-sensevoice.js'
import { runSenseVoiceCli } from './run-sensevoice-cli.js'
import { cleanSenseVoiceTranscript } from './sensevoice-text.js'

export { cleanSenseVoiceTranscript } from './sensevoice-text.js'
export { runSenseVoiceCli } from './run-sensevoice-cli.js'

export type SenseVoiceTranscribeResult = {
  text: string
  segments: WhisperSegment[]
}

export type SenseVoiceReadyInfo = {
  ready: boolean
  source: SenseVoiceAssetSource
  modelsDir: string
}

function assetExistsInSearchDirs(filename: string, repoRoot?: string): boolean {
  return resolveSenseVoiceAssetInSearchDirs(filename, repoRoot).source !== 'missing'
}

export function isSenseVoiceModelInstalled(
  modelName = 'q8',
  repoRoot?: string,
): boolean {
  const filename = resolveSenseVoiceModelFilename(modelName)
  return assetExistsInSearchDirs(filename, repoRoot)
}

export function isSenseVoiceVadInstalled(repoRoot?: string): boolean {
  return assetExistsInSearchDirs(getSenseVoiceVadFilename(), repoRoot)
}

export function isSenseVoiceReady(modelName = 'q8', repoRoot?: string): boolean {
  return isSenseVoiceModelInstalled(modelName, repoRoot)
    && isSenseVoiceVadInstalled(repoRoot)
}

export function getSenseVoiceReadyInfo(
  modelName = 'q8',
  repoRoot?: string,
): SenseVoiceReadyInfo {
  const modelFile = resolveSenseVoiceModelFilename(modelName)
  const vadFile = getSenseVoiceVadFilename()
  const modelResolved = resolveSenseVoiceAssetInSearchDirs(modelFile, repoRoot)
  const vadResolved = resolveSenseVoiceAssetInSearchDirs(vadFile, repoRoot)
  const ready = modelResolved.source !== 'missing' && vadResolved.source !== 'missing'

  let source: SenseVoiceAssetSource = 'missing'
  if (ready) {
    source = modelResolved.source === 'bundled' || vadResolved.source === 'bundled'
      ? 'bundled'
      : 'user'
  }

  const modelsDir = modelResolved.path
    ? path.dirname(modelResolved.path)
    : getSenseVoiceModelsDir()

  return { ready, source, modelsDir }
}

export class SenseVoiceRuntime {
  /** 缺失时仅下载到用户 models 目录，不写入内置路径。 */
  async ensureAssets(modelName = 'q8', repoRoot?: string): Promise<void> {
    await ensureDirAsync(getSenseVoiceModelsDir())
    await ensureSenseVoiceRuntime()

    if (!isSenseVoiceModelInstalled(modelName, repoRoot)) {
      await downloadSenseVoiceModelFile(modelName, getSenseVoiceModelsDir())
      if (!isSenseVoiceModelInstalled(modelName, repoRoot)) {
        throw new Error(`SenseVoice 模型 ${modelName} 下载后仍未找到，请检查网络或稍后重试`)
      }
    }

    if (!isSenseVoiceVadInstalled(repoRoot)) {
      await downloadSenseVoiceVadFile(getSenseVoiceModelsDir())
      if (!isSenseVoiceVadInstalled(repoRoot)) {
        throw new Error('SenseVoice VAD 模型下载后仍未找到，请检查网络或稍后重试')
      }
    }
  }

  async transcribe(
    wavPath: string,
    modelName = 'q8',
    repoRoot?: string,
  ): Promise<SenseVoiceTranscribeResult> {
    return globalInferenceQueue.enqueue(async () => {
      await this.ensureAssets(modelName, repoRoot)
      const text = await runSenseVoiceCli(wavPath, { modelName, repoRoot })
      return {
        text,
        segments: text ? [{ text }] : [],
      }
    })
  }
}

export const senseVoiceRuntime = new SenseVoiceRuntime()
