#!/usr/bin/env node
/**
 * End-to-end release metadata checks after finalize (before R2 sync).
 *
 * Usage: verify-release-coherence.mjs <git-tag> <assets-dir>
 */
import fs from 'node:fs'
import path from 'node:path'
import { readYamlFile } from './lib/load-yaml.mjs'
import {
  UPDATE_YML_PUBLIC,
  assertMacMergedUpdateInfo,
  assertYmlReferencesInAssetSet,
  inferredPrereleaseChannel,
  parseTagVersion,
  validateMacArtifactLabelMap,
} from './lib/release-metadata-policy.mjs'
import { MAC_ARTIFACT_LABEL } from './lib/desktop-artifact-names.mjs'

function loadAssets(dir) {
  return new Set(
    fs.readdirSync(dir)
      .filter((name) => fs.statSync(path.join(dir, name)).isFile())
      .map((name) => name.trim())
      .filter(Boolean),
  )
}

function main() {
  const [tag, assetsDir] = process.argv.slice(2)
  if (!tag || !assetsDir) {
    console.error('Usage: verify-release-coherence.mjs <git-tag> <assets-dir>')
    process.exit(1)
  }

  validateMacArtifactLabelMap(MAC_ARTIFACT_LABEL)

  const tagVersion = parseTagVersion(tag)
  const inferred = inferredPrereleaseChannel(tagVersion)
  if (inferred && inferred !== 'latest') {
    console.log(
      `note: semver pre-release channel would be "${inferred}" but publish.channel=latest keeps latest-*.yml`,
    )
  }

  const assets = loadAssets(assetsDir)
  if (assets.size === 0) {
    throw new Error(`No files under ${assetsDir}`)
  }

  for (const ymlName of UPDATE_YML_PUBLIC) {
    const ymlPath = path.join(assetsDir, ymlName)
    if (!fs.existsSync(ymlPath)) {
      throw new Error(`Missing required public update metadata: ${ymlName}`)
    }
    const info = readYamlFile(ymlPath)
    if (info.version !== tagVersion) {
      throw new Error(`${ymlName} version ${info.version} != tag ${tagVersion}`)
    }
    assertYmlReferencesInAssetSet(ymlName, info, assets)
    if (ymlName === 'latest-mac.yml') {
      assertMacMergedUpdateInfo(info)
    }
    console.log(`verify-release-coherence: OK ${ymlName} (v${info.version})`)
  }

  console.log(`verify-release-coherence: OK ${tag} (${assets.size} assets)`)
}

try {
  main()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
