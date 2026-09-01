#!/usr/bin/env node
/**
 * CLI fetch of core models into /models (optional legacy entrypoint path).
 * Primary path: onboarding via POST /api/system/core-models/ensure.
 */
import {
  ensureAllCoreModels,
  resolveModelsDir,
} from './lib/core-models.mjs'

const LOG = 'docker-fetch-models'

async function main() {
  console.log(`${LOG}: models root ${resolveModelsDir()}`)
  await ensureAllCoreModels({
    logPrefix: LOG,
    onProgress: ({ modelId, phase }) => {
      console.log(`${LOG}: ${modelId} → ${phase}`)
    },
  })
  console.log(`${LOG}: all core models ready`)
}

main().catch((err) => {
  console.error(`${LOG}: FAILED`, err instanceof Error ? err.message : err)
  process.exit(1)
})
