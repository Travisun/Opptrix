#!/usr/bin/env node
/** Fast policy self-check (no build). Run in CI or locally after editing release scripts. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAC_ARTIFACT_LABEL,
  WIN_ARTIFACT_LABEL,
  LINUX_ARTIFACT_LABEL,
} from './lib/desktop-artifact-names.mjs'
import {
  UPDATE_CHANNEL,
  UPDATE_YML_PUBLIC,
  assertSafeArtifactLabel,
  buildGenericPublishConfig,
  validateMacArtifactLabelMap,
} from './lib/release-metadata-policy.mjs'
import { UPDATER_ENTRY_MARKER } from './lib/updater-vendor-paths.mjs'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8'))
const files = pkg.build?.files ?? []

assertSafeArtifactLabel(WIN_ARTIFACT_LABEL, 'WIN_ARTIFACT_LABEL')
assertSafeArtifactLabel(LINUX_ARTIFACT_LABEL, 'LINUX_ARTIFACT_LABEL')
validateMacArtifactLabelMap(MAC_ARTIFACT_LABEL)

const sample = buildGenericPublishConfig('https://update.opptrix.org/desktop/')
if (sample.channel !== UPDATE_CHANNEL || sample.provider !== 'generic') {
  throw new Error('buildGenericPublishConfig shape mismatch')
}

if (!files.some((entry) => entry === 'build/updater-deps/**/*')) {
  throw new Error('package.json build.files must include "build/updater-deps/**/*"')
}
if (files.some((entry) => String(entry).includes('build/updater-deps/node_modules'))) {
  throw new Error(
    'package.json build.files must not stage updater under build/updater-deps/node_modules '
      + '(electron-builder skips node_modules directories during packaging)',
  )
}

console.log('verify-release-metadata-policy: OK')
console.log(`  channel=${UPDATE_CHANNEL} yml=${UPDATE_YML_PUBLIC.join(', ')}`)
console.log(`  mac labels=${JSON.stringify(MAC_ARTIFACT_LABEL)}`)
console.log(`  updater marker=${UPDATER_ENTRY_MARKER}`)
