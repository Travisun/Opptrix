#!/usr/bin/env node
/** Verify every url/path in a latest-*.yml exists on the GitHub Release asset list. */
import fs from 'node:fs'
import path from 'node:path'
import { readYamlFile } from './lib/load-yaml.mjs'
import { assertYmlReferencesInAssetSet } from './lib/release-metadata-policy.mjs'

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

  assertYmlReferencesInAssetSet(path.basename(ymlPath), info, assets)
  console.log(`verify-release-yml-on-github: OK ${path.basename(ymlPath)}`)
}

main()
