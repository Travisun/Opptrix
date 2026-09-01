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
  /** Overall progress across all core models (0–100). */
  percent: number
  /** Progress within the current model (0–100). */
  modelPercent: number
  currentModelId: string | null
  currentModelLabel: string | null
  bytesReceived: number | null
  bytesTotal: number | null
  bytesPerSecond: number | null
  etaSeconds: number | null
  allReady: boolean
  items: CoreModelItemProgress[]
  error: string | null
}

let coreModelsMod: CoreModelsSharedModule | null = null
let lastJob: CoreModelsEnsureJobSnapshot = createIdleJob()
let activePromise: Promise<void> | null = null

type SpeedSample = { atMs: number; bytes: number }

function createIdleJob(): CoreModelsEnsureJobSnapshot {
  return {
    phase: 'idle',
    message: '尚未开始下载',
    accepted: false,
    started: false,
    percent: 0,
    modelPercent: 0,
    currentModelId: null,
    currentModelLabel: null,
    bytesReceived: null,
    bytesTotal: null,
    bytesPerSecond: null,
    etaSeconds: null,
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

function labelForModel(modelId: string, items: Array<{ id: string; label: string }>): string {
  return items.find((i) => i.id === modelId)?.label ?? '组件'
}

function computeOverallPercent(
  items: CoreModelItemProgress[],
  currentModelId: string | null,
  modelRatio: number,
): number {
  const total = items.length || 1
  let sum = 0
  for (const item of items) {
    if (item.phase === 'ready') {
      sum += 1
      continue
    }
    if (item.id === currentModelId && item.phase === 'downloading') {
      sum += Math.max(0, Math.min(1, modelRatio))
    }
  }
  return Math.max(0, Math.min(99, Math.round((sum / total) * 100)))
}

function updateSpeedEta(
  sample: SpeedSample | null,
  received: number,
  total: number | null,
): { sample: SpeedSample; bytesPerSecond: number | null; etaSeconds: number | null } {
  const now = Date.now()
  if (!sample || now - sample.atMs < 400) {
    return {
      sample: sample ?? { atMs: now, bytes: received },
      bytesPerSecond: lastJob.bytesPerSecond,
      etaSeconds: lastJob.etaSeconds,
    }
  }
  const dt = (now - sample.atMs) / 1000
  const db = received - sample.bytes
  let bps = lastJob.bytesPerSecond
  if (dt > 0 && db >= 0) {
    const instant = db / dt
    bps = bps != null && bps > 0 ? bps * 0.65 + instant * 0.35 : instant
  }
  let eta: number | null = null
  if (bps != null && bps > 512 && total != null && total > received) {
    eta = Math.max(1, Math.round((total - received) / bps))
  }
  return {
    sample: { atMs: now, bytes: received },
    bytesPerSecond: bps != null && Number.isFinite(bps) ? Math.round(bps) : null,
    etaSeconds: eta,
  }
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
    modelPercent: 0,
    currentModelId: null,
    currentModelLabel: null,
    bytesReceived: null,
    bytesTotal: null,
    bytesPerSecond: null,
    etaSeconds: null,
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
        modelPercent: 100,
        allReady: true,
        message: '本地能力组件已就绪',
        currentModelId: null,
        currentModelLabel: null,
        bytesReceived: null,
        bytesTotal: null,
        bytesPerSecond: null,
        etaSeconds: null,
        items: status.items.map((item) => ({ id: item.id, phase: 'ready' })),
      })
      return
    }

    updateJob({ phase: 'downloading', percent: 5, message: '正在下载…' })

    let speedSample: SpeedSample | null = null

    await mod.ensureAllCoreModels({
      logPrefix: 'core-models',
      sourceOrder: sourceOrder.length ? sourceOrder : undefined,
      onProgress: (evt) => {
        const items = [...lastJob.items]
        const idx = items.findIndex((i) => i.id === evt.modelId)
        const entry: CoreModelItemProgress = {
          id: evt.modelId,
          phase: evt.phase === 'ready'
            ? 'ready'
            : evt.phase === 'error'
              ? 'error'
              : 'downloading',
          message: evt.message,
        }
        if (idx >= 0) items[idx] = entry
        else items.push(entry)

        const modelRatio = typeof evt.modelRatio === 'number'
          ? Math.max(0, Math.min(1, evt.modelRatio))
          : evt.phase === 'ready'
            ? 1
            : 0
        const modelPercent = Math.round(modelRatio * 100)
        const label = labelForModel(evt.modelId, status.items)
        const overall = evt.phase === 'ready' && items.every((i) => i.phase === 'ready')
          ? 100
          : computeOverallPercent(items, evt.modelId, modelRatio)

        let bytesReceived = lastJob.bytesReceived
        let bytesTotal = lastJob.bytesTotal
        let bytesPerSecond = lastJob.bytesPerSecond
        let etaSeconds = lastJob.etaSeconds

        if (typeof evt.bytesReceived === 'number') {
          bytesReceived = evt.bytesReceived
          bytesTotal = typeof evt.bytesTotal === 'number' ? evt.bytesTotal : null
          const speed = updateSpeedEta(speedSample, evt.bytesReceived, bytesTotal)
          speedSample = speed.sample
          bytesPerSecond = speed.bytesPerSecond
          etaSeconds = speed.etaSeconds
        } else if (evt.phase === 'ready' || evt.phase === 'error') {
          bytesReceived = null
          bytesTotal = null
          bytesPerSecond = null
          etaSeconds = null
          speedSample = null
        }

        const message = evt.phase === 'ready'
          ? `「${label}」已就绪`
          : evt.phase === 'error'
            ? `「${label}」未能完成`
            : `正在下载「${label}」`

        updateJob({
          phase: 'downloading',
          items,
          percent: overall,
          modelPercent,
          currentModelId: evt.phase === 'downloading' ? evt.modelId : lastJob.currentModelId,
          currentModelLabel: evt.phase === 'downloading' ? label : lastJob.currentModelLabel,
          bytesReceived,
          bytesTotal,
          bytesPerSecond,
          etaSeconds,
          message,
        })
      },
    })

    const after = mod.buildCoreModelsStatus()
    updateJob({
      phase: after.allReady ? 'ready' : 'error',
      percent: after.allReady ? 100 : lastJob.percent,
      modelPercent: after.allReady ? 100 : lastJob.modelPercent,
      allReady: after.allReady,
      message: after.allReady ? '本地能力组件已就绪' : '部分组件未能就绪，请重试或从本地导入',
      error: after.allReady ? null : '部分组件未能就绪',
      currentModelId: null,
      currentModelLabel: null,
      bytesReceived: null,
      bytesTotal: null,
      bytesPerSecond: null,
      etaSeconds: null,
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
      percent: lastJob.percent,
      allReady: after.allReady,
      message,
      error: message,
      currentModelId: null,
      currentModelLabel: null,
      bytesReceived: null,
      bytesTotal: null,
      bytesPerSecond: null,
      etaSeconds: null,
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
          modelPercent: 100,
          message: '本地能力组件已就绪',
          items: status.items.map((item) => ({ id: item.id, phase: 'ready' })),
          error: null,
          currentModelId: null,
          currentModelLabel: null,
          bytesReceived: null,
          bytesTotal: null,
          bytesPerSecond: null,
          etaSeconds: null,
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
          modelPercent: 100,
          currentModelId: null,
          currentModelLabel: null,
          bytesReceived: null,
          bytesTotal: null,
          bytesPerSecond: null,
          etaSeconds: null,
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
