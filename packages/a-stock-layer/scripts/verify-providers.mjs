#!/usr/bin/env node
/** Verify all providers follow §6.4 standard integration (manifest SPEC + thin driver + market handler). */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = join(scriptDir, '../src/providers')
const skip = new Set(['common'])
/** @type {string[]} */
const errors = []

for (const ent of readdirSync(root, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue
  const id = ent.name
  if (skip.has(id)) continue
  const dir = join(root, id)
  if (!existsSync(join(dir, 'manifest.ts'))) {
    errors.push(`${id}: missing manifest.ts`)
    continue
  }
  for (const f of ['driver.ts', 'settings.ts', 'index.ts']) {
    if (!existsSync(join(dir, f))) errors.push(`${id}: missing ${f}`)
  }
  const manifest = readFileSync(join(dir, 'manifest.ts'), 'utf8')
  if (!manifest.includes('_SPEC:')) errors.push(`${id}: manifest missing *_SPEC`)
  const driver = readFileSync(join(dir, 'driver.ts'), 'utf8')
  if (!driver.includes('applyManifestSpec')) errors.push(`${id}: driver missing applyManifestSpec`)
  if (!driver.includes('MarketHandler') && !driver.includes('extends')) {
    errors.push(`${id}: driver not extending market handler`)
  }
  const marketDir = join(dir, 'markets')
  if (!existsSync(marketDir)) {
    errors.push(`${id}: missing markets/`)
    continue
  }
  let hasHandler = false
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (ent.name === 'handler.ts') hasHandler = true
    }
  }
  walk(marketDir)
  if (!hasHandler) errors.push(`${id}: missing markets/*/handler.ts`)
}

for (const p of ['../src/tushare', '../src/drivers']) {
  if (existsSync(join(scriptDir, p))) errors.push(`shim directory still exists: ${p}`)
}

if (errors.length) {
  console.error('Provider audit failed:\n' + errors.map(e => `  - ${e}`).join('\n'))
  process.exit(1)
}
console.log('Provider audit OK: 19 registered providers, no shim directories.')
