#!/usr/bin/env node
/** Merge per-arch latest-mac-*.yml from CI matrix into one latest-mac.yml for electron-updater. */
import fs from 'node:fs'
import path from 'node:path'
import { readYamlFile, writeYamlFile } from './lib/load-yaml.mjs'
import { assertMacMergedUpdateInfo } from './lib/release-metadata-policy.mjs'

function usage() {
  console.error('Usage: merge-mac-update-yml.mjs <arm64.yml> <x64.yml> <out.yml>')
  process.exit(1)
}

function fileEntries(info) {
  if (Array.isArray(info.files) && info.files.length > 0) return info.files
  if (info.path) {
    return [{
      url: info.path,
      sha512: info.sha512,
      size: info.size,
    }]
  }
  return []
}

function mergeMacUpdateYml(arm64Path, x64Path, outPath) {
  const arm64 = readYamlFile(arm64Path)
  const x64 = readYamlFile(x64Path)

  if (!arm64?.version || !x64?.version) {
    throw new Error('Both mac update yml files must include version')
  }
  if (arm64.version !== x64.version) {
    throw new Error(`Version mismatch: arm64=${arm64.version} x64=${x64.version}`)
  }

  const seen = new Set()
  const files = []
  for (const entry of [...fileEntries(arm64), ...fileEntries(x64)]) {
    const url = entry?.url
    if (!url || seen.has(url)) continue
    seen.add(url)
    files.push(entry)
  }

  const arm64Zip = files.find((f) => f.url.includes('arm64') && f.url.endsWith('.zip'))
  if (!arm64Zip) {
    throw new Error('Merged mac update metadata must include an arm64 .zip (electron-updater arch filter)')
  }

  const releaseDate = [arm64.releaseDate, x64.releaseDate].filter(Boolean).sort().at(-1)

  const merged = {
    version: arm64.version,
    files,
    path: arm64Zip.url,
    sha512: arm64Zip.sha512,
    size: arm64Zip.size,
    releaseDate,
  }
  assertMacMergedUpdateInfo(merged)

  writeYamlFile(outPath, merged)

  console.log(`Merged latest-mac.yml (${files.length} file entries) → ${outPath}`)
}

const [arm64Path, x64Path, outPath] = process.argv.slice(2)
if (!arm64Path || !x64Path || !outPath) usage()

if (!fs.existsSync(arm64Path)) throw new Error(`Missing ${arm64Path}`)
if (!fs.existsSync(x64Path)) throw new Error(`Missing ${x64Path}`)

mergeMacUpdateYml(arm64Path, x64Path, outPath)
