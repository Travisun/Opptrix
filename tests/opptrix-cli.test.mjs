/**
 * opptrix CLI — parse / mirrors / help surface (no Docker required).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgv, flagTrue, flagString } from '../scripts/lib/opptrix/parse.mjs'
import {
  normalizeMirrorProfile,
  resolveBuildMirrorEnv,
  resolveGitCloneUrls,
  ensureTrailingSlash,
  CN_MIRROR_DEFAULTS,
  GIT_CLONE_DEFAULTS,
} from '../scripts/lib/opptrix/mirrors.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLI = path.join(ROOT, 'packages/selfhost/bin/opptrix.mjs')

test('parseArgv extracts command, flags, and -- passthrough', () => {
  const a = parseArgv(['up', '--mirror', 'cn', '--skip-models', '-f'])
  assert.equal(a.command, 'up')
  assert.equal(a.flags.mirror, 'cn')
  assert.equal(flagTrue(a.flags, 'skip-models'), true)
  assert.equal(flagTrue(a.flags, 'f'), true)

  const b = parseArgv(['compose', '--', 'ps', '-a'])
  assert.equal(b.command, 'compose')
  assert.deepEqual(b.args, ['ps', '-a'])

  assert.equal(flagString({ tail: '100' }, 'tail'), '100')
})

test('normalizeMirrorProfile and resolveBuildMirrorEnv cn/foreign', () => {
  assert.equal(normalizeMirrorProfile('cn'), 'cn')
  assert.equal(normalizeMirrorProfile('China'), 'cn')
  assert.equal(normalizeMirrorProfile(''), 'foreign')
  assert.throws(() => normalizeMirrorProfile('nope'))

  assert.equal(ensureTrailingSlash('docker.m.daocloud.io/library'), 'docker.m.daocloud.io/library/')

  const cn = resolveBuildMirrorEnv('cn', {})
  assert.equal(cn.profile, 'cn')
  assert.equal(cn.OPPTRIX_DOCKER_IMAGE_PREFIX, CN_MIRROR_DEFAULTS.dockerImagePrefix)
  assert.equal(cn.OPPTRIX_NPM_REGISTRY, CN_MIRROR_DEFAULTS.npmRegistry)
  assert.equal(cn.OPPTRIX_APT_MIRROR, CN_MIRROR_DEFAULTS.aptMirror)

  const foreign = resolveBuildMirrorEnv('foreign', {})
  assert.equal(foreign.OPPTRIX_DOCKER_IMAGE_PREFIX, '')
  assert.equal(foreign.OPPTRIX_NPM_REGISTRY, '')

  const override = resolveBuildMirrorEnv('cn', {
    OPPTRIX_DOCKER_IMAGE_PREFIX: 'docker.1ms.run/library',
  })
  assert.equal(override.OPPTRIX_DOCKER_IMAGE_PREFIX, 'docker.1ms.run/library/')
})

test('resolveGitCloneUrls: cn→Gitee first, foreign→GitHub first', () => {
  const cn = resolveGitCloneUrls('cn', {})
  assert.equal(cn[0], GIT_CLONE_DEFAULTS.cn)
  assert.equal(cn[1], GIT_CLONE_DEFAULTS.foreign)
  assert.match(cn[0], /gitee\.com/)

  const foreign = resolveGitCloneUrls('foreign', {})
  assert.equal(foreign[0], GIT_CLONE_DEFAULTS.foreign)
  assert.equal(foreign[1], GIT_CLONE_DEFAULTS.cn)
  assert.match(foreign[0], /github\.com/)

  const forced = resolveGitCloneUrls('cn', { OPPTRIX_GIT_URL_OVERRIDE: 'https://example.com/x.git' })
  assert.deepEqual(forced, ['https://example.com/x.git'])
})

test('opptrix help exits 0 and lists commands', () => {
  const r = spawnSync(process.execPath, [CLI, 'help'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /opptrix/)
  assert.match(r.stdout, /install-cli/)
  assert.match(r.stdout, /update/)
  assert.match(r.stdout, /--mirror/)
})

test('opptrix doctor reports platform without requiring healthy docker', () => {
  const r = spawnSync(process.execPath, [CLI, 'doctor'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.match(r.stdout, /docker-compose\.yml/)
  assert.match(r.stdout, /Dockerfile/)
  assert.match(r.stdout, /platform=/)
})

test('package.json bin maps opptrix to selfhost package', async () => {
  const pkg = JSON.parse(
    await import('node:fs').then((fs) =>
      fs.promises.readFile(path.join(ROOT, 'package.json'), 'utf8'),
    ),
  )
  assert.equal(pkg.bin['opptrix'], 'packages/selfhost/bin/opptrix.mjs')
})
