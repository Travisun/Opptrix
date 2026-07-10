#!/usr/bin/env node
/** Ensure latest-*.yml paths reference files that exist beside the yml (or in releaseDir). */
import fs from 'node:fs'
import path from 'node:path'
import { readYamlFile } from './lib/load-yaml.mjs'
import { assertSafeArtifactBasename } from './lib/release-metadata-policy.mjs'

function fileEntries(info) {
  if (Array.isArray(info.files) && info.files.length > 0) return info.files
  if (info.path) {
    return [{
      url: info.path,
      sha512: info.sha512,
    }]
  }
  return []
}

function verifyUpdateYml(ymlPath, assetDir) {
  const info = readYamlFile(ymlPath)
  const base = path.basename(ymlPath)

  if (!info?.version) {
    throw new Error(`${base}: missing version`)
  }

  const entries = fileEntries(info)
  if (entries.length === 0) {
    throw new Error(`${base}: no files/path entries`)
  }

  for (const entry of entries) {
    const name = path.basename(entry.url)
    assertSafeArtifactBasename(name)
    const assetPath = path.join(assetDir, name)
    if (!fs.existsSync(assetPath)) {
      throw new Error(`${base} references missing asset: ${name}`)
    }
    if (!entry.sha512) {
      throw new Error(`${base} entry ${name} missing sha512`)
    }
  }

  const primary = info.path ? path.basename(info.path) : null
  if (primary) {
    assertSafeArtifactBasename(primary)
    if (!fs.existsSync(path.join(assetDir, primary))) {
      throw new Error(`${base} primary path missing asset: ${primary}`)
    }
  }

  console.log(`verify-release-artifacts: OK ${base} (${entries.length} entries, v${info.version})`)
}

function main() {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: verify-release-artifacts.mjs <releaseDir|file.yml> [assetDir]')
    process.exit(1)
  }

  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    const releaseDir = target
    let verified = 0
    for (const name of fs.readdirSync(releaseDir)) {
      if (!name.startsWith('latest') || !name.endsWith('.yml')) continue
      if (name === 'latest-mac-arm64.yml' || name === 'latest-mac-x64.yml') continue
      verifyUpdateYml(path.join(releaseDir, name), releaseDir)
      verified++
    }
    if (verified === 0) {
      const ymls = fs.readdirSync(releaseDir).filter((name) => name.endsWith('.yml'))
      throw new Error(
        `No latest-*.yml update metadata in ${releaseDir}. Found: ${ymls.join(', ') || 'none'}. `
          + 'Ensure publish.channel is "latest" (dev pre-release versions otherwise emit dev-*.yml).',
      )
    }
    return
  }

  const ymlPath = target
  const assetDir = process.argv[3] ?? path.dirname(ymlPath)
  verifyUpdateYml(ymlPath, assetDir)
}

main()
