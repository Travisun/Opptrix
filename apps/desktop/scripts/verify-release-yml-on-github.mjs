#!/usr/bin/env node
/** Verify every url/path in a latest-*.yml exists on the GitHub Release asset list. */
import fs from 'node:fs'
import path from 'node:path'
import { readYamlFile } from './lib/load-yaml.mjs'

function fileEntries(info) {
  if (Array.isArray(info.files) && info.files.length > 0) return info.files
  if (info.path) return [{ url: info.path }]
  return []
}

function main() {
  const [ymlPath, assetsListPath] = process.argv.slice(2)
  if (!ymlPath || !assetsListPath) {
    console.error('Usage: verify-release-yml-on-github.mjs <update.yml> <release-assets.txt>')
    process.exit(1)
  }

  const info = readYamlFile(ymlPath)
  const assets = new Set(
    fs.readFileSync(assetsListPath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )

  const names = new Set()
  for (const entry of fileEntries(info)) {
    names.add(path.basename(entry.url))
  }
  if (info.path) names.add(path.basename(info.path))

  for (const name of names) {
    if (!assets.has(name)) {
      throw new Error(`${path.basename(ymlPath)} references ${name}, not found on GitHub Release assets`)
    }
  }

  console.log(`verify-release-yml-on-github: OK ${path.basename(ymlPath)} (${names.size} assets on release)`)
}

main()
