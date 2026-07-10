#!/usr/bin/env node
/** Fast policy self-check (no build). Run in CI or locally after editing release scripts. */
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

assertSafeArtifactLabel(WIN_ARTIFACT_LABEL, 'WIN_ARTIFACT_LABEL')
assertSafeArtifactLabel(LINUX_ARTIFACT_LABEL, 'LINUX_ARTIFACT_LABEL')
validateMacArtifactLabelMap(MAC_ARTIFACT_LABEL)

const sample = buildGenericPublishConfig('https://update.opptrix.org/desktop/')
if (sample.channel !== UPDATE_CHANNEL || sample.provider !== 'generic') {
  throw new Error('buildGenericPublishConfig shape mismatch')
}

console.log('verify-release-metadata-policy: OK')
console.log(`  channel=${UPDATE_CHANNEL} yml=${UPDATE_YML_PUBLIC.join(', ')}`)
console.log(`  mac labels=${JSON.stringify(MAC_ARTIFACT_LABEL)}`)
