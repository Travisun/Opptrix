#!/usr/bin/env node
/**
 * opptrix-ext — Phase A extension CLI.
 *
 * Commands:
 *   create <name>        Scaffold a new extension (manifest + host entry + README)
 *   build                Bundle host entry (esbuild) → dist/host/index.js
 *   pack                 Produce .opx (zip + checksums) from dist + manifest
 *   doctor               Validate manifest, permissions, size, shared contracts
 *   compat               Print engines vs host compatibility
 *
 * Dev mode: OPPTRIX_EXT_DEV=1 skips signature in pack.
 *
 * Phase A scope: local development + packaging. Publish to official registry is Phase B.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { generateKeyPairSync, createPrivateKey, createHash, sign } from 'node:crypto'
import { join, resolve, basename } from 'node:path'
import { deflateSync } from 'node:zlib'
import { cwd } from 'node:process'
import { pathToFileURL } from 'node:url'

const OPX_ZIP_MAX_BYTES = 2 * 1024 * 1024
const HOST_BUNDLE_MAX_BYTES = 512 * 1024

const VALID_PERMISSIONS = [
  'storage', 'llm', 'sessions.read', 'data.query', 'shell',
  'schedule', 'events.subscribe', 'events.emit', 'platform.info',
]
const VALID_ACTIVATIONS = ['catalog_only', 'worker_stub', 'worker_js']
const ABI_VERSION = '0.9.0-phase-a'

// ── create ──────────────────────────────────────────────────────────────────

function cmdCreate(name) {
  const root = resolve(cwd(), name)
  if (existsSync(root)) {
    console.error(`[opptrix-ext] directory already exists: ${root}`)
    process.exit(1)
  }
  mkdirSync(join(root, 'src'), { recursive: true })

  const id = `com.example.${name.replace(/[^a-zA-Z0-9]/g, '-')}`
  const manifest = {
    id,
    name,
    version: '0.1.0',
    description: 'A Opptrix extension',
    permissions: ['storage', 'events.subscribe', 'platform.info'],
    activation: 'catalog_only',
    contributes: {},
    engines: { opptrix: '^0.9.0' },
  }
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const hostEntry = `/**
 * ${name} — host entry.
 *
 * @param {import('@opptrix/extension-sdk').ExtensionHostContext} ctx
 */
export async function activate(ctx) {
  ctx.log.info('${name} activated')
  await ctx.storage.set('initialized', true)

  await ctx.hooks.register('session.messageCommitted', async (payload) => {
    ctx.log.info('message committed', payload.sessionId)
    return { ok: true }
  })
}
`
  writeFileSync(join(root, 'src', 'host.ts'), hostEntry)

  const readme = `# ${name}

Phase A Opptrix extension.

## Develop
\`\`\`bash
opptrix-ext build
opptrix-ext pack
\`\`\`

## Install
Upload the \`.opx\` via the Opptrix settings UI or:
\`\`\`bash
curl -X POST --data-binary @dist/${id}-v0.1.0.opx \\
  http://localhost:8711/api/platform/extensions/install
\`\`\`
`
  writeFileSync(join(root, 'README.md'), readme)

  console.log(`[opptrix-ext] created ${name} at ${root}`)
  console.log(`  id: ${id}`)
  console.log(`  next: cd ${name} && opptrix-ext build && opptrix-ext pack`)
}

// ── build ───────────────────────────────────────────────────────────────────

async function cmdBuild() {
  const manifestPath = join(cwd(), 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error('[opptrix-ext] manifest.json not found in current directory')
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entry = join(cwd(), 'src', 'host.ts')
  if (!existsSync(entry)) {
    console.error('[opptrix-ext] src/host.ts not found')
    process.exit(1)
  }

  // Lazy-load esbuild (may not be a direct dep of every project).
  let esbuild
  try {
    esbuild = await import('esbuild')
  } catch {
    console.error('[opptrix-ext] esbuild not found. Install it: npm i -D esbuild')
    process.exit(1)
  }

  const outDir = join(cwd(), 'dist', 'host')
  if (existsSync(outDir)) rmSync(outDir, { recursive: true })
  mkdirSync(outDir, { recursive: true })

  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: join(outDir, 'index.js'),
    // Only @opptrix/extension-sdk is external (injected by host).
    external: ['@opptrix/extension-sdk'],
    logLevel: 'info',
  })

  console.log(`[opptrix-ext] built → dist/host/index.js`)
}

// ── pack ────────────────────────────────────────────────────────────────────

function cmdPack() {
  const manifestPath = join(cwd(), 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error('[opptrix-ext] manifest.json not found')
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const id = manifest.id
  const version = manifest.version ?? '0.1.0'

  const files = {}
  files['manifest.json'] = JSON.stringify(manifest, null, 2)

  // Include host bundle if built.
  const hostBundle = join(cwd(), 'dist', 'host', 'index.js')
  if (existsSync(hostBundle)) {
    files['dist/host/index.js'] = readFileSync(hostBundle)
  }

  // Build a store-only zip.
  const zip = buildStoredZip(files)
  if (zip.length > OPX_ZIP_MAX_BYTES) {
    console.error(`[opptrix-ext] .opx exceeds ${OPX_ZIP_MAX_BYTES} bytes (${zip.length})`)
    process.exit(1)
  }

  const outDir = join(cwd(), 'dist')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const opxName = `${id}-v${version}.opx`
  const opxPath = join(outDir, opxName)
  writeFileSync(opxPath, zip)

  // Checksums.
  const sha = createHash('sha256').update(zip).digest('hex')
  writeFileSync(join(outDir, `${opxName}.sha256`), `${sha}  ${opxName}\n`)

  console.log(`[opptrix-ext] packed → ${opxPath} (${zip.length} bytes, sha256 ${sha.slice(0, 16)}…)`)
}

// ── doctor ──────────────────────────────────────────────────────────────────

function cmdDoctor() {
  const manifestPath = join(cwd(), 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error('[opptrix-ext] manifest.json not found')
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const problems = []

  if (!manifest.id || typeof manifest.id !== 'string') problems.push('id required')
  if (manifest.activation && !VALID_ACTIVATIONS.includes(manifest.activation)) {
    problems.push(`invalid activation: ${manifest.activation}`)
  }
  if (manifest.permissions) {
    for (const p of manifest.permissions) {
      if (!VALID_PERMISSIONS.includes(p)) problems.push(`unknown permission: ${p}`)
    }
  }
  if (manifest.activation === 'worker_js') {
    const hostBundle = join(cwd(), 'dist', 'host', 'index.js')
    if (!existsSync(hostBundle)) problems.push('worker_js requires dist/host/index.js (run opptrix-ext build)')
    else {
      const size = statSync(hostBundle).size
      if (size > HOST_BUNDLE_MAX_BYTES) problems.push(`host bundle ${size}b exceeds ${HOST_BUNDLE_MAX_BYTES}b`)
      const src = readFileSync(hostBundle, 'utf8')
      if (/\brequire\s*\(/.test(src)) problems.push('host bundle uses require() — use ESM import')
    }
  }

  if (problems.length === 0) {
    console.log(`[opptrix-ext] ✓ ${manifest.id}@${manifest.version ?? '?'} looks healthy`)
  } else {
    console.error(`[opptrix-ext] doctor found ${problems.length} problem(s):`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
}

// ── compat ──────────────────────────────────────────────────────────────────

function cmdCompat() {
  console.log(`[opptrix-ext] ABI: ${ABI_VERSION}`)
  console.log(`  Valid permissions: ${VALID_PERMISSIONS.join(', ')}`)
  console.log(`  Valid activations: ${VALID_ACTIVATIONS.join(', ')}`)
  console.log(`  .opx max size: ${OPX_ZIP_MAX_BYTES} bytes`)
  console.log(`  host bundle max: ${HOST_BUNDLE_MAX_BYTES} bytes`)
}

// ── zip builder (store-only, no compression) ────────────────────────────────

function buildStoredZip(files) {
  const localParts = []
  const cdParts = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8) // stored
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    const cd = Buffer.alloc(46 + nameBuf.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offset, 42)
    nameBuf.copy(cd, 46)
    localParts.push(local, data)
    cdParts.push(cd)
    offset += local.length + data.length
  }
  const cdBuf = Buffer.concat(cdParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(cdParts.length, 8)
  eocd.writeUInt16LE(cdParts.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, cdBuf, eocd])
}

function crc32(buf) {
  // Simple CRC32 (same algorithm as node:zlib crc32).
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

// ── keygen ──────────────────────────────────────────────────────────────────

function cmdKeygen() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  writeFileSync(join(cwd(), 'publisher-private-key.pem'), priv, { mode: 0o600 })
  writeFileSync(join(cwd(), 'publisher-public-key.pem'), pub)
  console.log('[opptrix-ext] keypair generated:')
  console.log('  publisher-private-key.pem  (never ship / never commit)')
  console.log('  publisher-public-key.pem   (distribute with your extension or publish to the store)')
}

// ── sign ────────────────────────────────────────────────────────────────────

function cmdSign() {
  const keyPath = join(cwd(), 'publisher-private-key.pem')
  if (!existsSync(keyPath)) {
    console.error('[opptrix-ext] publisher-private-key.pem not found — run `opptrix-ext keygen`')
    process.exit(1)
  }
  const opxPath = join(cwd(), 'dist')
  if (!existsSync(opxPath)) {
    console.error('[opptrix-ext] dist/ not found — run `opptrix-ext pack` first')
    process.exit(1)
  }
  // Sign the most recent .opx in dist/.
  const files = readdirSync(opxPath).filter((f) => f.endsWith('.opx'))
  if (files.length === 0) {
    console.error('[opptrix-ext] no .opx in dist/ — run `opptrix-ext pack` first')
    process.exit(1)
  }
  const opxName = files.sort().at(-1)
  const zipBuf = readFileSync(join(opxPath, opxName))
  const priv = readFileSync(keyPath, 'utf8')
  const sig = signChecksumsFromZip(zipBuf, priv)
  writeFileSync(join(opxPath, opxName + '.sig'), sig)
  console.log(`[opptrix-ext] signed → dist/${opxName}.sig (${sig.length} bytes)`)
  console.log('  embed into the .opx as SIGNATURE.ed25519 or upload the .sig alongside.')
}

/** Sign a built CHECKSUMS payload derived from the zip's own entries. */
function signChecksumsFromZip(zipBuf, privateKeyPem) {
  const entries = readZipEntriesFlat(zipBuf)
  const lines = entries
    .map(({ name, data }) => `${createHash('sha256').update(data).digest('hex')}  ${name}`)
    .sort()
  const payload = lines.join('\n') + (lines.length > 0 ? '\n' : '')
  const key = createPrivateKey(privateKeyPem)
  return sign(null, Buffer.from(payload, 'utf8'), key)
}

/** Minimal flat zip entry reader (name + data) for signing. */
function readZipEntriesFlat(buf) {
  const entries = []
  // Walk local file headers sequentially (pack writes them contiguously).
  let off = 0
  while (off + 30 <= buf.length) {
    if (buf.readUInt32LE(off) !== 0x04034b50) break
    const nameLen = buf.readUInt16LE(off + 26)
    const extraLen = buf.readUInt16LE(off + 28)
    const dataLen = buf.readUInt32LE(off + 18)
    const name = buf.slice(off + 30, off + 30 + nameLen).toString('utf8')
    const data = buf.slice(off + 30 + nameLen, off + 30 + nameLen + dataLen)
    entries.push({ name, data })
    off += 30 + nameLen + extraLen + dataLen
  }
  return entries
}

// ── main (manual arg parsing — no external deps) ────────────────────────────

const [, , cmd, ...rest] = process.argv

// ── store (client of the local server's /api/platform/store endpoints) ─────

async function storeApi(path, init) {
  const base = process.env.OPPTRIX_SERVER_URL ?? 'http://127.0.0.1:8711'
  const resp = await fetch(base + '/api/platform/store' + path, init)
  const body = await resp.json().catch(() => ({}))
  return { status: resp.status, body }
}

const commands = {
  keygen: cmdKeygen,
  sign: cmdSign,
  store: async () => {
    const sub = rest[0]
    try {
      if (sub === 'search') {
        const q = rest[1] ?? ''
        const { body } = await storeApi(`/search?q=${encodeURIComponent(q)}`)
        for (const item of body.items ?? []) {
          console.log(`${item.id}  v${item.version}  ${item.name ?? ''}`)
        }
        if ((body.items ?? []).length === 0) console.log('(no results)')
        return
      }
      if (sub === 'info') {
        const id = rest[1]
        if (!id) { console.error('usage: opptrix-ext store info <id>'); process.exit(1) }
        const { body } = await storeApi(`/extensions/${encodeURIComponent(id)}`)
        console.log(JSON.stringify(body, null, 2))
        return
      }
      if (sub === 'install') {
        const id = rest[1]
        if (!id) { console.error('usage: opptrix-ext store install <id> [version]'); process.exit(1) }
        const version = rest[2]
        const { body } = await storeApi('/install', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, ...(version ? { version } : {}) }),
        })
        console.log(JSON.stringify(body, null, 2))
        return
      }
      console.log('usage: opptrix-ext store <search|info|install> …')
    } catch (err) {
      console.error('[opptrix-ext] store error:', err.message)
      process.exit(1)
    }
  },
  create: () => {
    const name = rest[0]
    if (!name) {
      console.error('[opptrix-ext] usage: opptrix-ext create <name>')
      process.exit(1)
    }
    cmdCreate(name)
  },
  build: cmdBuild,
  pack: cmdPack,
  doctor: cmdDoctor,
  compat: cmdCompat,
  help: () => {
    console.log(`opptrix-ext — Opptrix extension CLI (Phase A)

Commands:
  keygen          Generate an Ed25519 publisher keypair
  sign            Sign the latest .opx with the publisher key
  store <sub>     Marketplace (search/info/install) — needs local server
  create <name>   Scaffold a new extension
  build           Bundle host entry with esbuild
  pack            Produce .opx package
  doctor          Validate manifest and build
  compat          Print compatibility info
  help            Show this message
`)
  },
}

const fn = commands[cmd] ?? commands.help
if (fn === cmdBuild || typeof fn !== 'function') {
  // cmdBuild is async.
}
const result = fn()
if (result && typeof result.catch === 'function') {
  result.catch((err) => {
    console.error('[opptrix-ext] error:', err.message)
    process.exit(1)
  })
}
