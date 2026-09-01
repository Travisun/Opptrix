/**
 * First-boot / post-activate hooks under a runtime slot.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { RuntimeMarker } from './runtime-marker.js'
import { readRuntimeMarker } from './runtime-marker.js'

const HOOK_DIR_SEGMENTS = ['hooks', 'post-activate'] as const
const HOOK_EXTS = new Set(['.mjs', '.js'])

export type HookProgressEvent = {
  phase: 'start' | 'done' | 'error'
  script: string
  index: number
  total: number
  error?: string
}

export type RunPostActivateHooksOptions = {
  marker?: RuntimeMarker | null
  onProgress?: (event: HookProgressEvent) => void
  /** Override node binary (default: process.execPath) */
  nodePath?: string
  env?: NodeJS.ProcessEnv
}

export type RunPostActivateHooksResult = {
  ok: boolean
  scripts: string[]
  ran: number
}

function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Resolve a marker-relative hook path to an absolute path under slotDir.
 * Rejects escape attempts (`..`, absolute paths outside slot).
 */
function resolveHookPath(slotDir: string, relOrAbs: string): string | null {
  const absSlot = path.resolve(slotDir)
  const candidate = path.isAbsolute(relOrAbs)
    ? path.resolve(relOrAbs)
    : path.resolve(absSlot, relOrAbs)
  if (!isPathInside(absSlot, candidate)) return null
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null
  return candidate
}

function scanHookDirectory(slotDir: string): string[] {
  const dir = path.join(path.resolve(slotDir), ...HOOK_DIR_SEGMENTS)
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return []
  const names = fs.readdirSync(dir)
    .filter(name => HOOK_EXTS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
  return names
    .map(name => path.join(dir, name))
    .filter(p => fs.statSync(p).isFile())
}

/**
 * Absolute paths of post-activate hooks for a slot.
 * Prefers `marker.hooks.postActivate`; else scans `hooks/post-activate/*.{mjs,js}` sorted.
 */
export function listPostActivateHooks(
  slotDir: string,
  marker?: RuntimeMarker | null,
): string[] {
  const m = marker ?? readRuntimeMarker(slotDir)
  const listed = m?.hooks?.postActivate
  if (Array.isArray(listed) && listed.length > 0) {
    const resolved: string[] = []
    for (const rel of listed) {
      if (typeof rel !== 'string' || !rel.trim()) continue
      const abs = resolveHookPath(slotDir, rel.trim())
      if (abs) resolved.push(abs)
    }
    return resolved
  }
  return scanHookDirectory(slotDir)
}

function pickOpptrixEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(source)) {
    if (k.startsWith('OPPTRIX_') && v !== undefined) out[k] = v
  }
  return out
}

function runNodeScript(
  nodePath: string,
  scriptAbs: string,
  slotDir: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [scriptAbs], {
      cwd: slotDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    })
    child.on('error', err => {
      reject(err)
    })
    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }
      const detail = stderr.trim()
      reject(
        new Error(
          detail
            ? `hook exited ${code}: ${detail}`
            : `hook exited with code ${code ?? 'null'}`,
        ),
      )
    })
  })
}

/**
 * Run post-activate hooks from the new slot. Fail-closed on non-zero / throw.
 * No scripts → no-op success (server still opens stores).
 */
export async function runPostActivateHooks(
  slotDir: string,
  opts: RunPostActivateHooksOptions = {},
): Promise<RunPostActivateHooksResult> {
  const absSlot = path.resolve(slotDir)
  const marker = opts.marker ?? readRuntimeMarker(absSlot)
  const scripts = listPostActivateHooks(absSlot, marker)
  if (scripts.length === 0) {
    return { ok: true, scripts: [], ran: 0 }
  }

  const nodePath = opts.nodePath ?? process.execPath
  const baseEnv = opts.env ?? process.env
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    ...pickOpptrixEnv(baseEnv),
    PATH: baseEnv.PATH,
  }

  let ran = 0
  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i]
    if (!script) continue
    opts.onProgress?.({
      phase: 'start',
      script,
      index: i,
      total: scripts.length,
    })
    try {
      await runNodeScript(nodePath, script, absSlot, env)
      ran += 1
      opts.onProgress?.({
        phase: 'done',
        script,
        index: i,
        total: scripts.length,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      opts.onProgress?.({
        phase: 'error',
        script,
        index: i,
        total: scripts.length,
        error: message,
      })
      throw new Error(
        `postActivate hook failed (${path.basename(script)}): ${message}`,
      )
    }
  }

  return { ok: true, scripts, ran }
}
