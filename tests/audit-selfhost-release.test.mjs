import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  assertCheckUpdateSmokeShape,
  verifyDockerBuildContext,
  verifyRuntimePackLayout,
  verifySelfhostBundle,
} from '../scripts/lib/selfhost-release-checks.mjs'

const ROOT = process.cwd()
const SELFHOST = path.join(ROOT, 'packages/selfhost')

test('verifyDockerBuildContext accepts monorepo Dockerfile', () => {
  const r = verifyDockerBuildContext(ROOT)
  assert.equal(r.ok, true)
})

test('verifySelfhostBundle after build', () => {
  const build = spawnSync('npm', ['run', 'build', '-w', '@opptrix/selfhost'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(build.status, 0, build.stderr || build.stdout)
  const r = verifySelfhostBundle(SELFHOST)
  assert.equal(r.version, '0.1.7')
})

test('verifyRuntimePackLayout validates single-arch pack layout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-audit-rt-'))
  const ver = '9.9.9-ci'
  const x64Bin = path.join(dir, `opptrix-runtime-linux-x64-v${ver}.bin`)
  const x64Sha = path.join(dir, `opptrix-runtime-linux-x64-v${ver}.sha256`)
  fs.writeFileSync(x64Bin, 'x'.repeat(128))
  fs.writeFileSync(x64Sha, `abc  opptrix-runtime-linux-x64-v${ver}.bin\n`)
  fs.writeFileSync(path.join(dir, `opptrix-runtime-v${ver}.bin`), fs.readFileSync(x64Bin))
  fs.writeFileSync(path.join(dir, `opptrix-runtime-v${ver}.sha256`), fs.readFileSync(x64Sha))

  const { plan, payload } = verifyRuntimePackLayout(dir, ver)
  assert.equal(plan.version, ver)
  assert.ok(plan.packages['linux-x64'])
  assertCheckUpdateSmokeShape(payload, ver, ['linux-x64'])

  fs.rmSync(dir, { recursive: true, force: true })
})

test('audit-selfhost-release --npm exits 0', () => {
  const r = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/audit-selfhost-release.mjs'),
    '--npm',
  ], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.match(r.stdout, /npm pack --dry-run OK/)
})

test('ci-selfhost-release workflow exists', async () => {
  const wf = await fs.promises.readFile(
    path.join(ROOT, '.github/workflows/ci-selfhost-release.yml'),
    'utf8',
  )
  assert.match(wf, /selfhost-npm-pack/)
  assert.match(wf, /runtime-pack/)
  assert.match(wf, /docker-build-smoke/)
  assert.match(wf, /merge-runtime-artifacts/)
})
