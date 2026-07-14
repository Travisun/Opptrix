#!/usr/bin/env node
/**
 * Create `<artifact>.opptrix-cms` detached CMS (DER) signatures using the
 * Opptrix update leaf key (.secrets or env).
 *
 * Usage:
 *   node scripts/sign-update-artifact.mjs path/to/Opptrix-*.AppImage
 *   node scripts/sign-update-artifact.mjs path/to/dir   # signs *.AppImage *.exe *.deb
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const CERTS = path.join(DESKTOP_ROOT, 'electron/certs')
const SECRETS = path.join(DESKTOP_ROOT, '.secrets')

function resolveKeyMaterial() {
  const leafCrt = path.join(CERTS, 'opptrix-code-signing.crt')
  const rootPem = path.join(CERTS, 'opptrix-update-root.pem')
  const keyCandidates = [
    process.env.OPPTRIX_CODE_SIGNING_KEY_PATH,
    path.join(SECRETS, 'opptrix-code-signing.key'),
  ].filter(Boolean)

  let leafKey = keyCandidates.find((p) => fs.existsSync(p))
  if (!leafKey && process.env.OPPTRIX_CODE_SIGNING_KEY_PEM) {
    leafKey = path.join(SECRETS, 'opptrix-code-signing.key.from-env')
    fs.mkdirSync(SECRETS, { recursive: true })
    fs.writeFileSync(leafKey, process.env.OPPTRIX_CODE_SIGNING_KEY_PEM, { mode: 0o600 })
  }
  if (!leafKey || !fs.existsSync(leafCrt) || !fs.existsSync(rootPem)) {
    throw new Error(
      'Missing signing material. Need electron/certs/*.crt|pem and '
        + '.secrets/opptrix-code-signing.key (or OPPTRIX_CODE_SIGNING_KEY_PEM).',
    )
  }
  return { leafKey, leafCrt, rootPem }
}

function signOne(filePath, material) {
  const out = `${filePath}.opptrix-cms`
  // Default CMS sign is detached (signature only); omit -nodetach.
  execFileSync(
    'openssl',
    [
      'cms', '-sign',
      '-binary',
      '-in', filePath,
      '-signer', material.leafCrt,
      '-inkey', material.leafKey,
      '-certfile', material.rootPem,
      '-outform', 'DER',
      '-out', out,
    ],
    { stdio: 'inherit' },
  )
  console.log(`Signed CMS → ${out}`)
}

function collectTargets(input) {
  const st = fs.statSync(input)
  if (st.isFile()) return [input]
  return fs.readdirSync(input)
    .filter((name) => /\.(AppImage|exe|deb)$/i.test(name) && !name.includes('.__'))
    .map((name) => path.join(input, name))
}

const input = path.resolve(process.argv[2] || path.join(DESKTOP_ROOT, 'release'))
if (!fs.existsSync(input)) {
  console.error(`path not found: ${input}`)
  process.exit(1)
}

const material = resolveKeyMaterial()
const targets = collectTargets(input)
if (targets.length === 0) {
  console.warn('no AppImage/exe/deb to sign')
  process.exit(0)
}
for (const file of targets) {
  signOne(file, material)
}
