/**
 * Core models ensure job + import orchestration (Docker self-host onboarding).
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDockerEnv } from '@opptrix/system-update'
import { resolveProjectRoot } from '@opptrix/shared'
import { getUserPreference, setUserPreference } from './user-preferences.js'
import type { CoreModelsSharedModule } from './core-models-types.js'

const PREF_KEY = 'core_model_source_order'

export type CoreModelEnsurePhase =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'ready'
  | 'error'

export interface CoreModelItemProgress {
  id: string
  phase: 'pending' | 'downloading' | 'ready' | 'error'
  message?: string
}

export interface CoreModelsEnsureJobSnapshot {
  phase: CoreModelEnsurePhase
  message: string
  accepted: boolean
  started: boolean
  percent: number
  allReady: boolean
  items: CoreModelItemProgress[]
  error: string | null
}

let coreModelsMod: CoreModelsSharedModule | null = null
let lastJob: CoreModelsEnsureJobSnapshot = createIdleJob()
let activePromise: Promise<void> | null = null

function createIdleJob(): CoreModelsEnsureJobSnapshot {
  return {
    phase: 'idle',
    message: '尚未开始下载',
    accepted: false,
    started: false,
    percent: 0,
    allReady: false,
    items: [],
    error: null,
  }
}

async function loadCoreModelsModule(): Promise<CoreModelsSharedModule> {
  if (coreModelsMod) return coreModelsMod
  const root = resolveProjectRoot(path.dirname(fileURLToPath(import.meta.url)))
  const modPath = path.join(root, 'scripts/lib/core-models.mjs')
  coreModelsMod = await import(pathToFileURL(modPath).href) as CoreModelsSharedModule
  return coreModelsMod
}

export function isCoreModelsFeatureRequired(): boolean {
  if (process.env.OPPTRIX_DESKTOP === '1') return false
  if (process.env.OPPTRIX_WITH_MODELS === '0') return false
  return isDockerEnv()
}

export function getStoredSourceOrder(): string[] {
  const stored = getUserPreference<string[] | null>(PREF_KEY, null)
  if (!Array.isArray(stored)) return []
  return stored.filter((s): s is string => typeof s === 'string')
}

export function saveSourceOrder(order: string[]): string[] {
  return setUserPreference(PREF_KEY, order)
}

export async function buildCoreModelsStatusDto() {
  const mod = await loadCoreModelsModule()
  const preferenceOrder = getStoredSourceOrder()
  const status = mod.buildCoreModelsStatus()
  const effectiveOrder = mod.resolveEffectiveSourceOrder(
    preferenceOrder.length ? preferenceOrder : undefined,
  )
  return {
    ...status,
    sourceOrder: effectiveOrder,
    required: isCoreModelsFeatureRequired() ? status.required : [],
    allReady: status.allReady,
    featureRequired: isCoreModelsFeatureRequired(),
  }
}

function updateJob(patch: Partial<CoreModelsEnsureJobSnapshot>): void {
  lastJob = { ...lastJob, ...patch }
}

function isActivePhase(phase: CoreModelEnsurePhase): boolean {
  return phase === 'preparing' || phase === 'downloading'
}

function toUserError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const cleaned = raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\/(?:Users|home|var|tmp|opt|models)\S*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return '下载未完成，请稍后重试'
  if (/超时|timeout/i.test(cleaned)) return '下载超时，请确认网络后重试'
  if (/网络|下载|失败|无法|不完整/.test(cleaned)) {
    return cleaned.includes('请') ? cleaned : '暂时无法完成下载，请稍后重试'
  }
  return cleaned.length > 120 ? '下载未完成，请稍后重试' : cleaned
}

async function runEnsurePipeline(sourceOrder: string[]): Promise<void> {
  const mod = await loadCoreModelsModule()
  const status = mod.buildCoreModelsStatus()

  updateJob({
    phase: 'preparing',
    accepted: true,
    started: true,
    error: null,
    percent: 2,
    message: '正在准备本地能力组件…',
    items: status.items.map((item) => ({
      id: item.id,
      phase: item.ready ? 'ready' : 'pending',
    })),
  })

  try {
    if (status.allReady) {
      updateJob({
        phase: 'ready',
        percent: 100,
        allReady: true,
        message: '本地能力组件已就绪',
        items: status.items.map((item) => ({ id: item.id, phase: 'ready' })),
      })
      return
    }

    updateJob({ phase: 'downloading', percent: 5, message: '正在下载…' })

    let pulse = 5
    const pulseTimer = setInterval(() => {
      if (!isActivePhase(lastJob.phase)) return
      pulse = Math.min(90, pulse + 3)
      updateJob({ percent: pulse })
    }, 2000)
    if (typeof pulseTimer === 'object' && pulseTimer !== null && 'unref' in pulseTimer) {
      pulseTimer.unref()
    }

    try {
      await mod.ensureAllCoreModels({
        logPrefix: 'core-models',
        sourceOrder: sourceOrder.length ? sourceOrder : undefined,
        onProgress: ({ modelId, phase, message }) => {
          const items = [...lastJob.items]
          const idx = items.findIndex((i) => i.id === modelId)
          const entry: CoreModelItemProgress = {
            id: modelId,
            phase: phase === 'ready'
              ? 'ready'
              : phase === 'error'
                ? 'error'
                : 'downloading',
            message,
          }
          if (idx >= 0) items[idx] = entry
          else items.push(entry)
          updateJob({
            phase: 'downloading',
            items,
            message: phase === 'downloading' ? '正在下载组件…' : lastJob.message,
          })
        },
      })
    } finally {
      clearInterval(pulseTimer)
    }

    const after = mod.buildCoreModelsStatus()
    updateJob({
      phase: after.allReady ? 'ready' : 'error',
      percent: after.allReady ? 100 : 0,
      allReady: after.allReady,
      message: after.allReady ? '本地能力组件已就绪' : '部分组件未能就绪，请重试或从本地导入',
      error: after.allReady ? null : '部分组件未能就绪',
      items: after.items.map((item) => ({
        id: item.id,
        phase: item.ready ? 'ready' : 'error',
      })),
    })
  } catch (err) {
    const message = toUserError(err)
    const after = mod.buildCoreModelsStatus()
    updateJob({
      phase: 'error',
      percent: 0,
      allReady: after.allReady,
      message,
      error: message,
      items: after.items.map((item) => ({
        id: item.id,
        phase: item.ready ? 'ready' : 'error',
      })),
    })
  } finally {
    activePromise = null
  }
}

export function getCoreModelsEnsureJobStatus(): CoreModelsEnsureJobSnapshot {
  if (!activePromise && !isActivePhase(lastJob.phase)) {
    void loadCoreModelsModule().then((mod) => {
      const status = mod.buildCoreModelsStatus()
      if (status.allReady && lastJob.phase !== 'error') {
        lastJob = {
          ...lastJob,
          phase: 'ready',
          allReady: true,
          percent: 100,
          message: '本地能力组件已就绪',
          items: status.items.map((item) => ({ id: item.id, phase: 'ready' })),
          error: null,
        }
      }
    }).catch(() => { /* ignore */ })
  }
  return { ...lastJob }
}

export function startCoreModelsEnsureJob(): CoreModelsEnsureJobSnapshot {
  if (isActivePhase(lastJob.phase) || activePromise) {
    return getCoreModelsEnsureJobStatus()
  }

  lastJob = {
    ...createIdleJob(),
    phase: 'preparing',
    accepted: true,
    started: true,
    message: '正在准备…',
    percent: 1,
  }

  void (async () => {
    try {
      const mod = await loadCoreModelsModule()
      const status = mod.buildCoreModelsStatus()
      if (status.allReady) {
        lastJob = {
          phase: 'ready',
          message: '本地能力组件已就绪',
          accepted: true,
          started: false,
          percent: 100,
          allReady: true,
          items: status.items.map((item) => ({ id: item.id, phase: 'ready' })),
          error: null,
        }
        return
      }

      lastJob = {
        ...lastJob,
        items: status.items.map((item) => ({
          id: item.id,
          phase: item.ready ? 'ready' : 'pending',
        })),
      }

      const order = getStoredSourceOrder()
      activePromise = runEnsurePipeline(order)
      await activePromise
    } catch (err) {
      updateJob({
        phase: 'error',
        error: toUserError(err),
        message: toUserError(err),
      })
      activePromise = null
    }
  })()

  return getCoreModelsEnsureJobStatus()
}

export async function persistSourceOrder(order: string[]): Promise<{ order: string[] } | { error: string }> {
  const mod = await loadCoreModelsModule()
  const normalized = mod.normalizeSourceOrderInput(order)
  if (!normalized) {
    return { error: '请选择至少一个有效的下载通道' }
  }
  saveSourceOrder(normalized)
  return { order: normalized }
}

export interface ImportFileInput {
  filename: string
  buffer: Buffer
}

export async function importCoreModelFiles(
  modelId: string,
  files: ImportFileInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mod = await loadCoreModelsModule()
  if (!mod.CORE_MODEL_IDS.includes(modelId)) {
    return { ok: false, error: '未知的模型类型' }
  }
  if (!files.length) {
    return { ok: false, error: '请选择要导入的文件' }
  }

  for (const file of files) {
    const check = mod.validateImportBuffer(modelId, file.buffer, file.filename)
    if (!check.ok) {
      return { ok: false, error: check.error ?? '文件校验未通过' }
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-core-import-'))
  try {
    for (const file of files) {
      const base = path.basename(file.filename)
      if (mod.isZipFilename(base)) {
        const zipPath = path.join(tmpDir, base)
        await fs.promises.writeFile(zipPath, file.buffer)
        const extracted = await extractZipToDir(zipPath, tmpDir)
        for (const rel of extracted) {
          const abs = path.join(tmpDir, rel)
          const buf = await fs.promises.readFile(abs)
          const dest = mod.mapImportDest(modelId, path.basename(rel))
          if (!dest) continue
          if (modelId === 'core.hy-mt-q4' || modelId === 'core.sensevoice-small-q8') {
            if (!mod.isGgufFilename(path.basename(rel))) continue
            if (!mod.isGgufBuffer(buf)) {
              return { ok: false, error: '压缩包内的 GGUF 文件无效' }
            }
          }
          await mod.writeImportFile(dest, buf)
        }
      } else {
        const dest = mod.mapImportDest(modelId, base)
        if (!dest) {
          return { ok: false, error: `无法识别文件 ${base}` }
        }
        if (mod.isGgufFilename(base) && !mod.isGgufBuffer(file.buffer)) {
          return { ok: false, error: '不是有效的 GGUF 模型文件' }
        }
        await mod.writeImportFile(dest, file.buffer)
      }
    }

    if (!mod.isCoreModelReady(modelId)) {
      return { ok: false, error: '导入后组件仍不完整，请确认文件齐全' }
    }
    return { ok: true }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

const execFileAsync = promisify(execFile)

async function extractZipToDir(zipPath: string, destRoot: string): Promise<string[]> {
  await fs.promises.mkdir(destRoot, { recursive: true })
  if (process.platform === 'win32') {
    await execFileAsync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destRoot.replace(/'/g, "''")}' -Force`],
      { timeout: 120_000 },
    )
  } else {
    await execFileAsync('unzip', ['-o', zipPath, '-d', destRoot], { timeout: 120_000 })
  }
  const written: string[] = []
  async function walk(dir: string, prefix = ''): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const ent of entries) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(abs, rel)
      } else {
        written.push(rel)
      }
    }
  }
  await walk(destRoot)
  return written
}

export function resetCoreModelsEnsureJobForTests(): void {
  lastJob = createIdleJob()
  activePromise = null
  coreModelsMod = null
}

export function setCoreModelsModuleForTests(mod: CoreModelsSharedModule | null): void {
  coreModelsMod = mod
}
