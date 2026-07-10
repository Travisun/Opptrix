import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(path.join(DESKTOP_ROOT, 'package.json'))

function resolveYamlModule() {
  const candidates = [
    'js-yaml',
    'electron-updater/node_modules/js-yaml',
    path.join(DESKTOP_ROOT, 'build/updater-deps/node_modules/js-yaml'),
    path.join(DESKTOP_ROOT, 'build/updater-deps/node_modules/electron-updater/node_modules/js-yaml'),
  ]
  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch { /* try next */ }
  }
  throw new Error('js-yaml not found — run npm ci')
}

const yaml = resolveYamlModule()

export function readYamlFile(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'))
}

export function writeYamlFile(filePath, data) {
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: 120, noRefs: true }))
}
