import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { resolveUserDataRoot } from '@opptrix/shared'
import { migrateDocLibrarySchema } from './schema-migrate.js'

const DB_FILE = 'doc-library.db'
const BLOBS_DIR = 'blobs'
const MARKDOWN_DIR = 'markdown'

/** 与 Architect 契约一致：e5-small / dim=384 */
export const EMBEDDING_MODEL_ID = 'multilingual-e5-small'
export const EMBEDDING_DIM = 384

export function docLibraryRoot(): string {
  return path.join(resolveUserDataRoot(), 'doc-library')
}

export function docLibraryDbPath(): string {
  return path.join(docLibraryRoot(), DB_FILE)
}

export function blobPathForSha(sha256: string): string {
  return path.join(docLibraryRoot(), BLOBS_DIR, sha256)
}

export function markdownPathForDocument(documentId: string): string {
  return path.join(docLibraryRoot(), MARKDOWN_DIR, `${documentId}.md`)
}

/** ~/.opptrix/llms/（与多模态 GGUF 同根；用户副本写于此） */
export function embeddingModelsRoot(): string {
  return path.join(resolveUserDataRoot(), 'llms')
}

/** 旧路径 ~/.opptrix/models/（仅搜索兼容，不再作为默认写入） */
export function legacyEmbeddingModelsRoot(): string {
  return path.join(resolveUserDataRoot(), 'models')
}

export function embeddingModelDir(): string {
  return path.join(embeddingModelsRoot(), EMBEDDING_MODEL_ID)
}

export type EmbeddingModelSource = 'bundled' | 'user' | 'missing'

function pushUniqueResolved(dirs: string[], dir: string): void {
  const resolved = path.resolve(dir)
  if (!dirs.includes(resolved)) dirs.push(resolved)
}

/** 开发态 / OPPTRIX_LLM_DIR 下的 `<id>` 候选（不含用户目录与 bundled） */
function listDevLlmModelDirs(modelId: string, repoRoot?: string): string[] {
  const dirs: string[] = []
  const llmDir = process.env.OPPTRIX_LLM_DIR?.trim()
  if (llmDir) pushUniqueResolved(dirs, path.join(path.resolve(llmDir), modelId))
  if (repoRoot) {
    pushUniqueResolved(dirs, path.join(repoRoot, 'apps/server/llms', modelId))
    pushUniqueResolved(dirs, path.join(repoRoot, 'llms', modelId))
  } else {
    pushUniqueResolved(dirs, path.resolve('apps/server/llms', modelId))
    pushUniqueResolved(dirs, path.resolve('llms', modelId))
  }
  return dirs
}

/** 相对本包位置解析桌面 stage 目录（不依赖 process.cwd）。 */
function desktopStagedLlmDir(modelId: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  // src|dist → packages/doc-library → repo root
  return path.resolve(here, '../../../apps/desktop/resources/llms', modelId)
}

/**
 * 优先 `OPPTRIX_E5_BUNDLED_DIR`，其次 Electron `resourcesPath/llms/…`。
 * 仅返回磁盘上已存在的目录（避免空路径抢占用户目录回退）。
 */
export function getBundledEmbeddingModelDir(repoRoot?: string): string | null {
  const candidates: string[] = []

  const fromEnv = process.env.OPPTRIX_E5_BUNDLED_DIR?.trim()
  if (fromEnv) candidates.push(path.resolve(fromEnv))

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'llms', EMBEDDING_MODEL_ID))
  }

  // Sidecar：OPPTRIX_RUNTIME_STAGE = resources/runtime-stage
  const runtimeStage = process.env.OPPTRIX_RUNTIME_STAGE?.trim()
  if (runtimeStage) {
    candidates.push(path.join(path.dirname(runtimeStage), 'llms', EMBEDDING_MODEL_ID))
  }

  if (repoRoot) {
    candidates.push(path.join(repoRoot, 'apps/desktop/resources/llms', EMBEDDING_MODEL_ID))
  }

  candidates.push(desktopStagedLlmDir(EMBEDDING_MODEL_ID))
  candidates.push(path.resolve('apps/desktop/resources/llms', EMBEDDING_MODEL_ID))

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return null
}

/**
 * 查找顺序：内置 → OPPTRIX_LLM_DIR/<id> → apps/server/llms/<id> → llms/<id>
 * → ~/.opptrix/llms/<id> → 旧 ~/.opptrix/models/<id>
 */
export function listEmbeddingModelSearchDirs(repoRoot?: string): string[] {
  const dirs: string[] = []
  const bundled = getBundledEmbeddingModelDir(repoRoot)
  if (bundled) pushUniqueResolved(dirs, bundled)
  for (const dir of listDevLlmModelDirs(EMBEDDING_MODEL_ID, repoRoot)) {
    pushUniqueResolved(dirs, dir)
  }
  pushUniqueResolved(dirs, embeddingModelDir())
  pushUniqueResolved(dirs, path.join(legacyEmbeddingModelsRoot(), EMBEDDING_MODEL_ID))
  return dirs
}

/** ~/.opptrix/lancedb/doc_chunks/ */
export function lanceDbDir(): string {
  return path.join(resolveUserDataRoot(), 'lancedb', 'doc_chunks')
}

/** ~/.opptrix/engines/ */
export function enginesRoot(): string {
  return path.join(resolveUserDataRoot(), 'engines')
}

/** 桌面内置 Python 侧车引擎 ID（与 resources/engines/<plat-arch>/<id>/ 对齐） */
export type RagEngineId = 'pdfplumber-worker' | 'rapidocr-worker'

/** `darwin-arm64` / `win32-x64` 等 */
export function platformEnginesKey(
  platform = process.platform,
  arch = process.arch,
): string {
  return `${platform}-${arch}`
}

/**
 * 安装包内置 RAG 引擎根目录（含 platform-arch 子目录）。
 * 优先 `OPPTRIX_RAG_ENGINES_BUNDLED_DIR`，其次 Electron `resourcesPath/engines`。
 */
export function getBundledEnginesRoot(repoRoot?: string): string | null {
  const candidates: string[] = []

  const fromEnv = process.env.OPPTRIX_RAG_ENGINES_BUNDLED_DIR?.trim()
  if (fromEnv) candidates.push(path.resolve(fromEnv))

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'engines'))
  }

  const runtimeStage = process.env.OPPTRIX_RUNTIME_STAGE?.trim()
  if (runtimeStage) {
    candidates.push(path.join(path.dirname(runtimeStage), 'engines'))
  }

  if (repoRoot) {
    candidates.push(path.join(repoRoot, 'apps/desktop/resources/engines'))
  }

  candidates.push(path.resolve('apps/desktop/resources/engines'))

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return null
}

/**
 * 当前平台内置引擎目录：`…/engines/<platform>-<arch>/<engineId>/`
 * 含 worker.py + requirements.txt + wheels/（至少一个 wheel）时视为齐全。
 */
export function getBundledEngineDir(
  engineId: RagEngineId,
  repoRoot?: string,
): string | null {
  const root = getBundledEnginesRoot(repoRoot)
  if (!root) return null
  const key = platformEnginesKey()
  const dir = path.join(root, key, engineId)
  if (!fs.existsSync(path.join(dir, 'worker.py'))) return null
  if (!fs.existsSync(path.join(dir, 'requirements.txt'))) return null
  const wheels = path.join(dir, 'wheels')
  if (!fs.existsSync(wheels)) return null
  try {
    const entries = fs.readdirSync(wheels)
    if (!entries.some((e) => e.endsWith('.whl') || e.endsWith('.tar.gz'))) return null
  } catch {
    return null
  }
  return dir
}

/** 解析 worker 来源：内置 engines → 仓库 scripts/ */
export function resolveEngineWorkerSource(
  engineId: RagEngineId,
  repoRoot?: string,
): { workerScript: string; requirements: string; fromBundled: boolean } | null {
  const bundled = getBundledEngineDir(engineId, repoRoot)
  if (bundled) {
    return {
      workerScript: path.join(bundled, 'worker.py'),
      requirements: path.join(bundled, 'requirements.txt'),
      fromBundled: true,
    }
  }

  const scriptName = engineId
  const candidates: string[] = []
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    // src → packages/doc-library → packages → repo root
    candidates.push(path.resolve(here, `../../../scripts/${scriptName}/worker.py`))
  } catch {
    /* ignore */
  }
  if (repoRoot) {
    candidates.push(path.join(repoRoot, 'scripts', scriptName, 'worker.py'))
  }
  candidates.push(path.resolve('scripts', scriptName, 'worker.py'))

  for (const worker of candidates) {
    if (fs.existsSync(worker)) {
      return {
        workerScript: worker,
        requirements: path.join(path.dirname(worker), 'requirements.txt'),
        fromBundled: false,
      }
    }
  }
  return null
}

/** ~/.opptrix/engines/pdfplumber-worker/ */
export function pdfplumberWorkerDir(): string {
  return path.join(enginesRoot(), 'pdfplumber-worker')
}

/** ~/.opptrix/engines/unlimited-ocr/（旧可选路径；默认 L2 见 rapidocrWorkerDir） */
export function unlimitedOcrDir(): string {
  return path.join(enginesRoot(), 'unlimited-ocr')
}

/** 桌面内置 / 用户副本：PP-OCRv4 mobile（RapidOCR ONNX） */
export const RAPIDOCR_MODEL_ID = 'rapidocr-ppocrv4-mobile'

export type RapidOcrModelSource = 'bundled' | 'user' | 'missing'

/** ~/.opptrix/engines/rapidocr-worker/ */
export function rapidocrWorkerDir(): string {
  return path.join(enginesRoot(), 'rapidocr-worker')
}

/** ~/.opptrix/llms/rapidocr-ppocrv4-mobile/ */
export function rapidocrUserModelDir(): string {
  return path.join(embeddingModelsRoot(), RAPIDOCR_MODEL_ID)
}

/**
 * 安装包内置 RapidOCR 模型目录。
 * 优先 `OPPTRIX_RAPIDOCR_BUNDLED_DIR`，其次 Electron `resourcesPath/llms/…`。
 */
export function getBundledRapidOcrModelDir(repoRoot?: string): string | null {
  const candidates: string[] = []

  const fromEnv = process.env.OPPTRIX_RAPIDOCR_BUNDLED_DIR?.trim()
  if (fromEnv) candidates.push(path.resolve(fromEnv))

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'llms', RAPIDOCR_MODEL_ID))
  }

  const runtimeStage = process.env.OPPTRIX_RUNTIME_STAGE?.trim()
  if (runtimeStage) {
    candidates.push(path.join(path.dirname(runtimeStage), 'llms', RAPIDOCR_MODEL_ID))
  }

  if (repoRoot) {
    candidates.push(path.join(repoRoot, 'apps/desktop/resources/llms', RAPIDOCR_MODEL_ID))
  }

  candidates.push(desktopStagedLlmDir(RAPIDOCR_MODEL_ID))
  candidates.push(path.resolve('apps/desktop/resources/llms', RAPIDOCR_MODEL_ID))

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return null
}

/**
 * 查找顺序：内置 → OPPTRIX_LLM_DIR/<id> → apps/server/llms/<id> → llms/<id>
 * → ~/.opptrix/llms/<id> → 旧 ~/.opptrix/models/<id>
 */
export function listRapidOcrModelSearchDirs(repoRoot?: string): string[] {
  const dirs: string[] = []
  const bundled = getBundledRapidOcrModelDir(repoRoot)
  if (bundled) pushUniqueResolved(dirs, bundled)
  for (const dir of listDevLlmModelDirs(RAPIDOCR_MODEL_ID, repoRoot)) {
    pushUniqueResolved(dirs, dir)
  }
  pushUniqueResolved(dirs, rapidocrUserModelDir())
  pushUniqueResolved(dirs, path.join(legacyEmbeddingModelsRoot(), RAPIDOCR_MODEL_ID))
  return dirs
}

export function sha256Buffer(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function newDocumentId(): string {
  return randomUUID()
}

export function ensureDocLibraryDirs(): void {
  fs.mkdirSync(path.join(docLibraryRoot(), BLOBS_DIR), { recursive: true })
  fs.mkdirSync(path.join(docLibraryRoot(), MARKDOWN_DIR), { recursive: true })
}

export function openDocLibraryDb(dbPath = docLibraryDbPath()): Database.Database {
  ensureDocLibraryDirs()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrateDocLibrarySchema(db)
  return db
}
