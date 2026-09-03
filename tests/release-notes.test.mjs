import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  HOT_RELEASES_RETENTION_MAX,
  buildCheckUpdatePayload,
  buildReleaseEntry,
  buildReleasesManifest,
  compareHotSemver,
  hotReleasesUrl,
  mergeReleaseHistory,
} from '../scripts/lib/hot-cdn.mjs'
import {
  extractMarkdownSectionBullets,
  loadReleaseNotesForVersion,
  parseReleaseNotesMarkdown,
  summarizeReleaseDescription,
} from '../scripts/lib/release-notes.mjs'

test('parseReleaseNotesMarkdown extracts 新功能 and 修复', () => {
  const md = `## 新功能

- 功能 A
- 功能 B

## 修复

- 修复 X
`
  const parsed = parseReleaseNotesMarkdown(md)
  assert.deepEqual(parsed.features, ['功能 A', '功能 B'])
  assert.deepEqual(parsed.fixes, ['修复 X'])
})

test('extractMarkdownSectionBullets skips 无', () => {
  const md = `## 新功能

- 无
- 有效项
`
  assert.deepEqual(extractMarkdownSectionBullets(md, '新功能'), ['有效项'])
})

test('loadReleaseNotesForVersion reads docs/releases', () => {
  const notes = loadReleaseNotesForVersion('1.3.5')
  assert.ok(notes.features.length > 0 || notes.fixes.length > 0)
})

test('summarizeReleaseDescription prefers first feature', () => {
  const s = summarizeReleaseDescription({ features: ['短说明'], fixes: [] })
  assert.equal(s, '短说明')
})

test('mergeReleaseHistory keeps newest 8 and updates duplicate version', () => {
  /** @type {Array<Record<string, unknown>>} */
  const existing = []
  for (let i = 5; i <= 14; i++) {
    existing.push(buildReleaseEntry({
      version: `1.4.${i}`,
      packages: { 'linux-x64': { binSize: i } },
      description: { features: [`v${i}`], fixes: [] },
    }))
  }
  const merged = mergeReleaseHistory(existing, buildReleaseEntry({
    version: '1.4.8',
    packages: { 'linux-x64': { binSize: 999 } },
    description: { features: ['updated'], fixes: [] },
  }))
  assert.equal(merged.length, HOT_RELEASES_RETENTION_MAX)
  assert.equal(merged[0].version, '1.4.14')
  const v8 = merged.find((r) => r.version === '1.4.8')
  assert.ok(v8)
  assert.deepEqual(v8.description, { features: ['updated'], fixes: [] })
})

test('mergeReleaseHistory drops versions below formal retention floor', () => {
  const merged = mergeReleaseHistory(
    [
      buildReleaseEntry({
        version: '1.4.4',
        packages: { 'linux-x64': { binSize: 1 } },
        description: { features: [], fixes: [] },
      }),
      buildReleaseEntry({
        version: '1.4.2',
        packages: { 'linux-x64': { binSize: 1 } },
        description: { features: [], fixes: [] },
      }),
    ],
    buildReleaseEntry({
      version: '1.4.5',
      packages: { 'linux-x64': { binSize: 2 } },
      description: { features: ['formal'], fixes: [] },
    }),
  )
  assert.deepEqual(merged.map((r) => r.version), ['1.4.5'])
})

test('compareHotSemver sorts semver', () => {
  assert.equal(compareHotSemver('1.2.0', '1.10.0'), -1)
  assert.equal(compareHotSemver('2.0.0', '1.9.9'), 1)
})

test('buildCheckUpdatePayload includes retention, releases, description', () => {
  const entry = buildReleaseEntry({
    version: '2.0.0',
    cdnBase: 'https://update.opptrix.org',
    packages: { 'linux-x64': { binSize: 100 }, 'linux-arm64': { binSize: 200 } },
    description: { features: ['新能力'], fixes: ['修 bug'] },
  })
  const payload = buildCheckUpdatePayload({
    version: '2.0.0',
    cdnBase: 'https://update.opptrix.org',
    packages: { 'linux-x64': { binSize: 100 }, 'linux-arm64': { binSize: 200 } },
    description: { features: ['新能力'], fixes: ['修 bug'] },
    releases: [entry],
  })
  assert.deepEqual(payload.retention, { max: HOT_RELEASES_RETENTION_MAX })
  assert.equal(payload.releases.length, 1)
  assert.deepEqual(payload.latest.description, { features: ['新能力'], fixes: ['修 bug'] })
  assert.equal(payload.latest.version, '2.0.0')
})

test('buildReleasesManifest caps releases', () => {
  const manifest = buildReleasesManifest({
    releases: Array.from({ length: 12 }, (_, i) => ({ version: `1.0.${i}` })),
    retentionMax: 8,
  })
  assert.equal(manifest.releases.length, 8)
})

test('hotReleasesUrl points at hot/releases', () => {
  assert.equal(
    hotReleasesUrl('https://update.opptrix.org'),
    'https://update.opptrix.org/hot/releases',
  )
})

test('loadReleaseNotesForVersion returns empty for missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-notes-'))
  try {
    const notes = loadReleaseNotesForVersion('9.9.9', dir)
    assert.deepEqual(notes, { features: [], fixes: [] })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
