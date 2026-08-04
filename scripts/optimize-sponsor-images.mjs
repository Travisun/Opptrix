#!/usr/bin/env node
/**
 * Convert personal-sponsor avatars under icons/sponsors/ to WebP.
 * Pipeline: longest edge ≤ 256px → cwebp -q 10 (aggressive size for README / site).
 *
 * Usage: node scripts/optimize-sponsor-images.mjs [--keep-source]
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'icons', 'sponsors')
const MAX_EDGE = 256
const WEBP_QUALITY = 10
const KEEP_SOURCE = process.argv.includes('--keep-source')
const SOURCE_EXT = new Set(['.png', '.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG'])

function requireBin(name) {
  const r = spawnSync('which', [name], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`Missing required binary: ${name}`)
  return r.stdout.trim()
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout || ''}`)
  }
  return r
}

function optimizeOne(srcPath) {
  const ext = path.extname(srcPath)
  const base = path.basename(srcPath, ext)
  const outPath = path.join(DIR, `${base}.webp`)
  const tmpPng = path.join(DIR, `.tmp-${base}.png`)

  try {
    run('sips', ['-Z', String(MAX_EDGE), srcPath, '--out', tmpPng])
    run('cwebp', ['-q', String(WEBP_QUALITY), tmpPng, '-o', outPath])
  } finally {
    fs.rmSync(tmpPng, { force: true })
  }

  const before = fs.statSync(srcPath).size
  const after = fs.statSync(outPath).size
  console.log(
    `${path.basename(srcPath)}  ${before} → ${path.basename(outPath)} ${after}  (−${Math.round((1 - after / before) * 100)}%)`,
  )

  if (!KEEP_SOURCE && path.resolve(srcPath) !== path.resolve(outPath)) {
    fs.rmSync(srcPath, { force: true })
  }
  return outPath
}

requireBin('sips')
requireBin('cwebp')

if (!fs.existsSync(DIR)) {
  throw new Error(`Sponsors dir missing: ${DIR}`)
}

const sources = fs
  .readdirSync(DIR)
  .filter((name) => SOURCE_EXT.has(path.extname(name)))
  .map((name) => path.join(DIR, name))
  .sort()

if (!sources.length) {
  console.log(`No PNG/JPEG sources in ${DIR} (already WebP-only?)`)
  process.exit(0)
}

console.log(`Optimizing ${sources.length} sponsor image(s) → WebP q=${WEBP_QUALITY}, max ${MAX_EDGE}px`)
for (const src of sources) optimizeOne(src)
console.log('Done. Point README / site at icons/sponsors/*.webp')
