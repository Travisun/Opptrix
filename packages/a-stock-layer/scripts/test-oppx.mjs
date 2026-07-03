#!/usr/bin/env node
/** Round-trip test for .oppx provider plugin packaging. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inspectOppxPackage,
  packOppx,
  suggestOppxFilename,
  validateOppxSignature,
} from '../dist/providers/oppx.js'
import {
  installFromOppx,
  listInstalledProviders,
  readInstalledIndex,
  uninstall,
} from '../dist/providers/installer.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oppx-test-'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const pluginDir = path.join(tmpRoot, 'sample-plugin')
  const distDir = path.join(pluginDir, 'dist')
  fs.mkdirSync(distDir, { recursive: true })
  fs.writeFileSync(
    path.join(pluginDir, 'provider.json'),
    `${JSON.stringify({
      providerId: 'demo-provider',
      version: '0.1.0',
      title: 'Demo Provider',
      entry: 'dist/index.js',
    }, null, 2)}\n`,
  )
  fs.writeFileSync(path.join(distDir, 'index.js'), 'export default { id: "demo-provider" };\n')
  fs.writeFileSync(
    path.join(pluginDir, 'package.json'),
    `${JSON.stringify({ name: '@demo/provider', version: '0.1.0' }, null, 2)}\n`,
  )

  const outPath = path.join(tmpRoot, suggestOppxFilename({ provider_id: 'demo-provider', version: '0.1.0' }))
  const packed = packOppx(pluginDir, outPath)
  assert(packed.length > 68, 'packed buffer too small')

  const inspected = inspectOppxPackage(outPath)
  assert(inspected.valid, inspected.error ?? 'inspect failed')
  assert(inspected.metadata?.provider_id === 'demo-provider', 'metadata provider_id mismatch')
  assert(validateOppxSignature(outPath), 'validateOppxSignature failed')

  const dataRoot = path.join(tmpRoot, 'data')
  const installed = installFromOppx(outPath, { dataRoot })
  assert(installed.providerId === 'demo-provider', 'installed providerId mismatch')
  assert(fs.existsSync(path.join(installed.path, 'provider.json')), 'provider.json missing after install')
  assert(fs.existsSync(path.join(installed.path, 'dist', 'index.js')), 'entry missing after install')

  const index = readInstalledIndex(dataRoot)
  assert(index.providers['demo-provider']?.version === '0.1.0', 'installed index version mismatch')
  assert(listInstalledProviders(dataRoot).length === 1, 'listInstalledProviders length mismatch')

  assert(uninstall('demo-provider', { dataRoot }), 'uninstall returned false')
  assert(!readInstalledIndex(dataRoot).providers['demo-provider'], 'provider still indexed after uninstall')

  console.log('OPPX test OK')
} catch (err) {
  console.error('OPPX test failed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}
