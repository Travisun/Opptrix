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

test('Dockerfile declares NODE_IMAGE_PREFIX / NPM_REGISTRY / APT_MIRROR / MIRROR_AUTO build-args', () => {
  const df = read('Dockerfile')
  assert.match(df, /ARG NODE_IMAGE_PREFIX=/)
  assert.match(df, /FROM \$\{NODE_IMAGE_PREFIX\}node:\$\{NODE_VERSION\}-bookworm AS build/)
  assert.match(df, /FROM \$\{NODE_IMAGE_PREFIX\}node:\$\{NODE_VERSION\}-bookworm-slim AS runtime/)
  assert.match(df, /ARG NPM_REGISTRY=/)
  assert.match(df, /npm config set registry/)
  assert.match(df, /ARG APT_MIRROR=/)
  assert.match(df, /COPY tsconfig\.base\.json/)
  assert.match(df, /ARG MIRROR_AUTO=/)
  assert.match(df, /ARG OPPTRIX_BASE_VERSION=/)
  assert.match(df, /docker-select-mirrors\.mjs/)
  assert.match(df, /deb\.debian\.org/)
  assert.match(df, /NVM_DIR=\/opt\/nvm/)
  assert.match(df, /model-free|Do NOT download SenseVoice/i)
})

test('docker-compose.yml passes build mirror args from env', () => {
  const yml = read('docker-compose.yml')
  assert.match(yml, /NODE_IMAGE_PREFIX:\s*"\$\{OPPTRIX_DOCKER_IMAGE_PREFIX:-\}"/)
  assert.match(yml, /NPM_REGISTRY:\s*"\$\{OPPTRIX_NPM_REGISTRY:-\}"/)
  assert.match(yml, /APT_MIRROR:\s*"\$\{OPPTRIX_APT_MIRROR:-\}"/)
  assert.match(yml, /MIRROR_AUTO:\s*"\$\{OPPTRIX_MIRROR_AUTO_BUILD:-\}"/)
  assert.match(yml, /OPPTRIX_MIRROR_AUTO:\s*"\$\{OPPTRIX_MIRROR_AUTO:-1\}"/)
  assert.match(yml, /OPPTRIX_FETCH_MODELS_ON_START:\s*"\$\{OPPTRIX_FETCH_MODELS_ON_START:-0\}"/)
})

test('docker-compose-with-mirrors.sh delegates to opptrix', () => {
  const script = path.join(ROOT, 'scripts/docker-compose-with-mirrors.sh')
  assert.ok(fs.existsSync(script))
  const src = read('scripts/docker-compose-with-mirrors.sh')
  assert.match(src, /packages\/selfhost\/bin\/opptrix\.(js|mjs)/)
  assert.match(src, /OPPTRIX_BUILD_MIRROR/)
})

test('compose.env.example documents build mirror vars', () => {
  const env = read('compose.env.example')
  assert.match(env, /OPPTRIX_DOCKER_IMAGE_PREFIX/)
  assert.match(env, /docker\.1ms\.run\/library\//)
  assert.match(env, /OPPTRIX_NPM_REGISTRY/)
  assert.match(env, /官方 npm|official npm|留空|empty/i)
  assert.match(env, /OPPTRIX_APT_MIRROR/)
  assert.match(env, /^OPPTRIX_MIRROR_AUTO=1/m)
  assert.match(env, /OPPTRIX_FETCH_MODELS_ON_START/)
  assert.match(env, /opptrix|docker-compose-with-mirrors/)
  assert.match(env, /NODE_IMAGE_PREFIX|Docker Hub|官方 Docker Hub/)
})

test('cn mirror profile exports via opptrix compose dry path', () => {
  // help does not need docker; ensure CLI loads under cn env
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/selfhost/bin/opptrix.js'), 'help'], {
    cwd: ROOT,
    env: { ...process.env, OPPTRIX_BUILD_MIRROR: 'cn' },
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
})
