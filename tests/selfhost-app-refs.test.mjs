/**
 * Self-host app ref / semver / release identity (no network required for unit cases).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_TAG_PREFIX,
  DEFAULT_IMAGE_REPOSITORY,
  MIN_APP_TAG,
  MIN_APP_VERSION,
  assertAppTagAllowed,
  classifyTagRelation,
  compareSemver,
  isAppTag,
  isAppTagAtLeastMin,
  parseAppTag,
  parseSemver,
  readAppTagMeta,
  resolveAppRef,
  resolveImageRef,
  resolveImageRepository,
  resolveReleaseIdentity,
} from '../packages/selfhost/src/app-refs.mjs'

test('parseSemver and compareSemver', () => {
  assert.deepEqual(parseSemver('1.3.6'), [1, 3, 6])
  assert.equal(compareSemver('1.3.6', '1.3.5'), 1)
  assert.equal(compareSemver('1.3.6', '1.3.6'), 0)
  assert.equal(compareSemver('1.2.0', '1.10.0'), -1)
  assert.equal(parseSemver('not-a-version'), null)
})

test('parseAppTag / isAppTag / min filter', () => {
  assert.deepEqual(parseAppTag('opptrix-selfhost-v1.3.6'), {
    tag: 'opptrix-selfhost-v1.3.6',
    version: '1.3.6',
  })
  assert.equal(parseAppTag('selfhost-v0.1.5'), null)
  assert.equal(parseAppTag('desktop-v1.3.6'), null)
  assert.equal(parseAppTag('main'), null)
  assert.equal(isAppTag('opptrix-selfhost-v1.3.6'), true)
  assert.equal(isAppTagAtLeastMin('opptrix-selfhost-v1.3.6'), true)
  assert.equal(isAppTagAtLeastMin('opptrix-selfhost-v1.3.5'), false)
  assert.equal(isAppTagAtLeastMin('opptrix-selfhost-v1.4.0'), true)
  assert.ok(MIN_APP_TAG.startsWith(APP_TAG_PREFIX))
  assert.equal(MIN_APP_VERSION, '1.3.6')
})

test('assertAppTagAllowed rejects below min', () => {
  assert.throws(
    () => assertAppTagAllowed('opptrix-selfhost-v1.3.5'),
    /低于最低可用版本/,
  )
  assert.doesNotThrow(() => assertAppTagAllowed('opptrix-selfhost-v1.3.6'))
  assert.doesNotThrow(() => assertAppTagAllowed('main'))
})

test('resolveAppRef order: cli > env > config > preferred; main only explicit', () => {
  const preferred = 'opptrix-selfhost-v1.3.6'

  const fromPreferred = resolveAppRef({ preferredAppTag: preferred, env: {} })
  assert.equal(fromPreferred.ref, preferred)
  assert.equal(fromPreferred.source, 'preferred')
  assert.equal(fromPreferred.explicit, false)

  const fromConfig = resolveAppRef({
    preferredAppTag: preferred,
    hostConfig: { appRef: 'opptrix-selfhost-v1.4.0' },
    env: {},
  })
  assert.equal(fromConfig.ref, 'opptrix-selfhost-v1.4.0')
  assert.equal(fromConfig.source, 'config')
  assert.equal(fromConfig.explicit, true)

  const fromEnv = resolveAppRef({
    preferredAppTag: preferred,
    hostConfig: { appRef: 'opptrix-selfhost-v1.4.0' },
    env: { OPPTRIX_GIT_REF: 'main' },
  })
  assert.equal(fromEnv.ref, 'main')
  assert.equal(fromEnv.source, 'env')
  assert.equal(fromEnv.explicit, true)

  const fromAppEnv = resolveAppRef({
    preferredAppTag: preferred,
    env: { OPPTRIX_APP_REF: 'opptrix-selfhost-v2.0.0' },
  })
  assert.equal(fromAppEnv.ref, 'opptrix-selfhost-v2.0.0')

  const fromCli = resolveAppRef({
    cliRef: 'opptrix-selfhost-v1.9.0',
    preferredAppTag: preferred,
    env: { OPPTRIX_GIT_REF: 'main' },
  })
  assert.equal(fromCli.ref, 'opptrix-selfhost-v1.9.0')
  assert.equal(fromCli.source, 'cli')

  assert.throws(
    () => resolveAppRef({
      preferredAppTag: preferred,
      cliRef: 'opptrix-selfhost-v1.0.0',
      env: {},
    }),
    /低于最低可用版本/,
  )

  assert.throws(
    () => resolveAppRef({ preferredAppTag: 'main', env: {} }),
    /默认应用快照无效|显式/,
  )
})

test('resolveReleaseIdentity from tag and main', () => {
  const tagged = resolveReleaseIdentity('opptrix-selfhost-v1.3.6')
  assert.equal(tagged.OPPTRIX_APP_VERSION, '1.3.6')
  assert.equal(tagged.OPPTRIX_RELEASE_CHANNEL, 'selfhost')
  assert.equal(tagged.OPPTRIX_RELEASE_TAG, 'opptrix-selfhost-v1.3.6')
  assert.equal(tagged.OPPTRIX_BASE_VERSION, 'opptrix-selfhost-v1.3.6')

  const main = resolveReleaseIdentity('main', { shortSha: 'abc1234dead' })
  assert.equal(main.OPPTRIX_RELEASE_CHANNEL, 'selfhost')
  assert.equal(main.OPPTRIX_RELEASE_TAG, 'main@abc1234')
  assert.equal(main.OPPTRIX_BASE_VERSION, undefined)
})

test('classifyTagRelation upgrade/rollback/current', () => {
  assert.equal(classifyTagRelation('opptrix-selfhost-v1.4.0', 'opptrix-selfhost-v1.3.6'), 'upgrade')
  assert.equal(classifyTagRelation('opptrix-selfhost-v1.3.6', 'opptrix-selfhost-v1.4.0'), 'rollback')
  assert.equal(classifyTagRelation('opptrix-selfhost-v1.3.6', 'opptrix-selfhost-v1.3.6'), 'current')
})

test('readAppTagMeta defaults', () => {
  const meta = readAppTagMeta({})
  assert.equal(meta.minAppTag, MIN_APP_TAG)
  assert.equal(meta.preferredAppTag, MIN_APP_TAG)
  assert.equal(meta.imageRepository, DEFAULT_IMAGE_REPOSITORY)

  const custom = readAppTagMeta({
    opptrixSelfhost: {
      minAppTag: 'opptrix-selfhost-v1.3.6',
      preferredAppTag: 'opptrix-selfhost-v1.4.0',
      imageRepository: 'ghcr.io/example/opptrix',
    },
  })
  assert.equal(custom.preferredAppTag, 'opptrix-selfhost-v1.4.0')
  assert.equal(custom.imageRepository, 'ghcr.io/example/opptrix')
})

test('resolveImageRef maps app tag to GHCR image', () => {
  assert.equal(
    resolveImageRef('opptrix-selfhost-v1.3.6'),
    'ghcr.io/travisun/opptrix:opptrix-selfhost-v1.3.6',
  )
  assert.equal(resolveImageRef('main'), null)
  assert.equal(resolveImageRef('selfhost-v0.1.6'), null)
  assert.equal(
    resolveImageRef('opptrix-selfhost-v1.4.0', {
      imageRepository: 'ghcr.io/other/opptrix',
    }),
    'ghcr.io/other/opptrix:opptrix-selfhost-v1.4.0',
  )
  assert.equal(
    resolveImageRef('opptrix-selfhost-v1.3.6', {
      env: { OPPTRIX_IMAGE_REPO: 'ghcr.io/mirror/opptrix/' },
    }),
    'ghcr.io/mirror/opptrix:opptrix-selfhost-v1.3.6',
  )
  assert.equal(resolveImageRepository({}), DEFAULT_IMAGE_REPOSITORY)
})

test('min filter keeps only >= 1.3.6 tags', () => {
  const tags = [
    'opptrix-selfhost-v1.3.5',
    'opptrix-selfhost-v1.3.6',
    'opptrix-selfhost-v1.4.0',
    'selfhost-v0.1.5',
  ]
  const kept = tags.filter((t) => isAppTagAtLeastMin(t))
  assert.deepEqual(kept, ['opptrix-selfhost-v1.3.6', 'opptrix-selfhost-v1.4.0'])
})
