/**
 * Linux bootstrap script — surface checks (no root / no network install).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'scripts/bootstrap/linux.sh')

test('bootstrap/linux.sh exists and is executable-ish', () => {
  const st = fs.statSync(SCRIPT)
  assert.ok(st.isFile())
  const src = fs.readFileSync(SCRIPT, 'utf8')
  assert.match(src, /^#!/)
  assert.match(src, /OPPTRIX_NODE_VERSION/)
  assert.match(src, /npmmirror\.com\/mirrors\/node/)
  assert.match(src, /mirrors\.aliyun\.com\/docker-ce/)
  assert.match(src, /registry-mirrors/)
  assert.match(src, /仅支持 Linux/)
  assert.match(src, /macOS \/ Windows/)
  assert.match(src, /gitee\.com\/Travisun\/Opptrix/)
})

test('ci-pins.env matches bootstrap Node pin and ubuntu LTS runner', () => {
  const pinsFile = path.join(ROOT, 'scripts/lib/ci-pins.env')
  const bootstrap = fs.readFileSync(SCRIPT, 'utf8')
  const ciPins = fs.readFileSync(pinsFile, 'utf8')
  const selfhostCi = fs.readFileSync(
    path.join(ROOT, '.github/workflows/ci-selfhost-release.yml'),
    'utf8',
  )
  const pin = bootstrap.match(/OPPTRIX_NODE_VERSION="\$\{OPPTRIX_NODE_VERSION:-([^}]+)\}"/)?.[1]
  assert.ok(pin, 'bootstrap default OPPTRIX_NODE_VERSION')
  assert.match(ciPins, new RegExp(`OPPTRIX_NODE_PATCH_VERSION=${pin.replace(/\./g, '\\.')}`))
  assert.match(ciPins, new RegExp(`CI_NODE_BOOKWORM_IMAGE=node:${pin.replace(/\./g, '\\.')}-bookworm`))
  const ubuntuRunner = ciPins.match(/^CI_UBUNTU_RUNNER=(.+)$/m)?.[1]
  assert.ok(ubuntuRunner, 'CI_UBUNTU_RUNNER')
  assert.match(ubuntuRunner, /^ubuntu-24\.04$/)
  assert.match(selfhostCi, new RegExp(`CI_UBUNTU_RUNNER: ${ubuntuRunner}`))
  // runs-on cannot use env context in GHA — must be literal matching the pin
  assert.match(selfhostCi, new RegExp(`runs-on:\\s*${ubuntuRunner}`))
})

test('bootstrap/linux.sh bash -n passes', () => {
  const r = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr || r.stdout)
})

test('bootstrap/linux.sh refuses non-Linux hosts', () => {
  if (process.platform === 'linux') {
    // On Linux CI we only assert the guard exists in source (see above).
    return
  }
  const r = spawnSync('bash', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, OPPTRIX_SKIP_DOCKER: '1', OPPTRIX_SKIP_NODE: '1' },
  })
  assert.equal(r.status, 2)
  assert.match(r.stderr + r.stdout, /仅支持 Linux/)
})

test('SELF-HOSTING.md documents Linux bootstrap and Win/Mac DIY', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/SELF-HOSTING.md'), 'utf8')
  assert.match(doc, /scripts\/bootstrap\/linux\.sh/)
  assert.match(doc, /@opptrix\/selfhost/)
  assert.match(doc, /macOS \/ Windows/)
  assert.match(doc, /自备 Docker|自行安装 \*\*Docker\*\*/)
})

test('@opptrix/selfhost README covers install, commands, mirrors', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'packages/selfhost/README.md'), 'utf8')
  assert.match(readme, /npm i -g @opptrix\/selfhost/)
  assert.match(readme, /opptrix doctor/)
  assert.match(readme, /opptrix init/)
  assert.match(readme, /自动/)
  assert.match(readme, /Gitee/)
  assert.match(readme, /OPPTRIX_DEPLOY_DIR/)
  assert.match(readme, /常见问题|FAQ/)
  assert.match(readme, /场景/)
  assert.match(readme, /127\.0\.0\.1:8712/)
  assert.match(readme, /Apache-2\.0/)
})
