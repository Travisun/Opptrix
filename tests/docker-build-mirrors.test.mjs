/**
 * Docker Compose / Dockerfile build-mirror wiring (CN ↔ foreign).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('Dockerfile declares NODE_IMAGE_PREFIX / NPM_REGISTRY / APT_MIRROR build-args', () => {
  const df = read('Dockerfile')
  assert.match(df, /ARG NODE_IMAGE_PREFIX=/)
  assert.match(df, /FROM \$\{NODE_IMAGE_PREFIX\}node:\$\{NODE_VERSION\}-bookworm AS build/)
  assert.match(df, /FROM \$\{NODE_IMAGE_PREFIX\}node:\$\{NODE_VERSION\}-bookworm-slim AS runtime/)
  assert.match(df, /ARG NPM_REGISTRY=/)
  assert.match(df, /npm config set registry/)
  assert.match(df, /ARG APT_MIRROR=/)
  assert.match(df, /deb\.debian\.org/)
})

test('docker-compose.yml passes build mirror args from env', () => {
  const yml = read('docker-compose.yml')
  assert.match(yml, /NODE_IMAGE_PREFIX:\s*"\$\{OPPTRIX_DOCKER_IMAGE_PREFIX:-\}"/)
  assert.match(yml, /NPM_REGISTRY:\s*"\$\{OPPTRIX_NPM_REGISTRY:-\}"/)
  assert.match(yml, /APT_MIRROR:\s*"\$\{OPPTRIX_APT_MIRROR:-\}"/)
})

test('docker-compose-with-mirrors.sh delegates to opptrix', () => {
  const script = path.join(ROOT, 'scripts/docker-compose-with-mirrors.sh')
  assert.ok(fs.existsSync(script))
  const src = read('scripts/docker-compose-with-mirrors.sh')
  assert.match(src, /packages\/selfhost\/bin\/opptrix\.mjs|opptrix\.mjs/)
  assert.match(src, /OPPTRIX_BUILD_MIRROR/)
})

test('compose.env.example documents build mirror vars', () => {
  const env = read('compose.env.example')
  assert.match(env, /OPPTRIX_DOCKER_IMAGE_PREFIX/)
  assert.match(env, /OPPTRIX_NPM_REGISTRY/)
  assert.match(env, /OPPTRIX_APT_MIRROR/)
  assert.match(env, /opptrix|docker-compose-with-mirrors/)
})

test('cn mirror profile exports via opptrix compose dry path', () => {
  // help does not need docker; ensure CLI loads under cn env
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/selfhost/bin/opptrix.mjs'), 'help'], {
    cwd: ROOT,
    env: { ...process.env, OPPTRIX_BUILD_MIRROR: 'cn' },
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
})
