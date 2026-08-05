/**
 * 解析本机 Python：RapidOCR 等依赖要求 3.10–3.12，优先避开 3.13+。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const CANDIDATES = [
  'python3.12',
  'python3.11',
  'python3.10',
  'python3',
  'python',
]

function versionOf(bin: string): { major: number; minor: number } | null {
  try {
    const r = spawnSync(bin, ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], {
      encoding: 'utf8',
      timeout: 8_000,
    })
    if (r.status !== 0 || !r.stdout) return null
    const m = String(r.stdout).trim().match(/^(\d+)\.(\d+)/)
    if (!m) return null
    return { major: Number(m[1]), minor: Number(m[2]) }
  } catch {
    return null
  }
}

function isUsable(bin: string): boolean {
  if (!bin) return false
  // Absolute path or PATH lookup
  if (bin.includes('/') || bin.includes('\\')) {
    if (!fs.existsSync(bin)) return false
  }
  const v = versionOf(bin)
  if (!v) return false
  // Prefer 3.10–3.12 for RapidOCR wheels; still accept other 3.x as last resort
  return v.major === 3
}

function score(bin: string): number {
  const v = versionOf(bin)
  if (!v) return -1
  if (v.major !== 3) return -1
  if (v.minor >= 10 && v.minor <= 12) return 100 - v.minor // prefer 3.12
  if (v.minor < 10) return 10
  return 1 // 3.13+ last resort
}

/**
 * 解析用于创建 venv / pip 的 Python。
 * envKeys 优先（如 OPPTRIX_RAPIDOCR_PYTHON），否则扫描 3.12→3.11→3.10→python3。
 */
export function resolveSystemPython(envKeys: string[] = []): string {
  for (const key of envKeys) {
    const v = process.env[key]?.trim()
    if (v && isUsable(v)) return v
  }
  const fromEnv = process.env.OPPTRIX_PYTHON?.trim()
  if (fromEnv && isUsable(fromEnv)) return fromEnv

  let best: string | null = null
  let bestScore = -1
  for (const bin of CANDIDATES) {
    const s = score(bin)
    if (s > bestScore) {
      bestScore = s
      best = bin
    }
  }
  return best ?? 'python3'
}

/** 是否为 RapidOCR 友好版本（3.10–3.12） */
export function isRapidOcrFriendlyPython(bin: string): boolean {
  const v = versionOf(bin)
  return Boolean(v && v.major === 3 && v.minor >= 10 && v.minor <= 12)
}
