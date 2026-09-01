#!/usr/bin/env node
/**
 * Copy self-host deploy assets from monorepo root → packages/selfhost/bundle.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(__dirname, '..')
const REPO = path.resolve(PKG, '../..')
const BUNDLE = path.join(PKG, 'bundle')

/** @type {{ src: string, dest: string }[]} */
const FILES = [
  { src: 'docker-compose.yml', dest: 'docker-compose.yml' },
  { src: 'Dockerfile', dest: 'Dockerfile' },
  { src: 'compose.env.example', dest: 'compose.env.example' },
  { src: '.dockerignore', dest: '.dockerignore' },
  { src: 'scripts/docker-entrypoint.sh', dest: 'scripts/docker-entrypoint.sh' },
  { src: 'scripts/system-boot.mjs', dest: 'scripts/system-boot.mjs' },
  { src: 'scripts/opptrix-node-supervisor.mjs', dest: 'scripts/opptrix-node-supervisor.mjs' },
]

function main() {
  if (!fs.existsSync(path.join(REPO, 'docker-compose.yml'))) {
    console.error('[selfhost-build] monorepo root not found at', REPO)
    process.exit(1)
  }
  fs.rmSync(BUNDLE, { recursive: true, force: true })
  fs.mkdirSync(path.join(BUNDLE, 'scripts'), { recursive: true })

  for (const { src, dest } of FILES) {
    const from = path.join(REPO, src)
    const to = path.join(BUNDLE, dest)
    if (!fs.existsSync(from)) {
      console.error(`[selfhost-build] missing ${src}`)
      process.exit(1)
    }
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    console.log(`[selfhost-build] ${src} → bundle/${dest}`)
  }

  const stamp = {
    builtAt: new Date().toISOString(),
    files: FILES.map((f) => f.dest),
  }
  fs.writeFileSync(path.join(BUNDLE, 'BUILD.json'), `${JSON.stringify(stamp, null, 2)}\n`)
  console.log('[selfhost-build] ok →', BUNDLE)
}

main()
