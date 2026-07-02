#!/usr/bin/env node
/** Fail fast when root devDependencies were not installed (common after fresh clone). */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'package.json'))

function missingPkg(name) {
  try {
    require.resolve(`${name}/package.json`)
    return false
  } catch {
    return true
  }
}

const deps = ['typescript', '@types/node'].filter(missingPkg)
if (deps.length) {
  console.error(
    `\n[@opptrix] Missing dev dependencies: ${deps.join(', ')}\n` +
    'Install from the repository root:\n\n  npm install\n\nor:\n\n  npm ci\n',
  )
  process.exit(1)
}
