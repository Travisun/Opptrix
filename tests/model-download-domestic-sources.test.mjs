/**
 * Domestic-first model download source ordering + HY-MT ModelScope wiring.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

async function loadDownloadLib() {
  const href = pathToFileURL(
    path.join(ROOT, 'apps/desktop/scripts/lib/model-download.mjs'),
  ).href
  return import(`${href}?t=${Date.now()}`)
}

function withEnv(patch, fn) {
  const prev = {}
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key]
    const v = patch[key]
    if (v === undefined) delete process.env[key]
    else process.env[key] = v
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(patch)) {
        if (prev[key] === undefined) delete process.env[key]
        else process.env[key] = prev[key]
      }
    })
}

test('resolveSourceOrder defaults to modelscope → hf-mirror → huggingface', async () => {
  await withEnv({
    OPPTRIX_MODEL_SOURCE_ORDER: undefined,
    OPPTRIX_CI_FOREIGN_MIRRORS: '0',
    CI: undefined,
    GITHUB_ACTIONS: undefined,
  }, async () => {
    const mod = await loadDownloadLib()
    assert.deepEqual(mod.resolveSourceOrder(), [
      'modelscope',
      'hf-mirror',
      'huggingface',
    ])
  })
})

test('resolveSourceOrder foreign CI prefers huggingface first', async () => {
  await withEnv({
    OPPTRIX_MODEL_SOURCE_ORDER: undefined,
    OPPTRIX_CI_FOREIGN_MIRRORS: '1',
    CI: undefined,
    GITHUB_ACTIONS: undefined,
  }, async () => {
    const mod = await loadDownloadLib()
    assert.deepEqual(mod.resolveSourceOrder(), [
      'huggingface',
      'hf-mirror',
      'modelscope',
    ])
  })
})

test('expandSourceOrder inserts hf-mirror before huggingface for domestic', async () => {
  await withEnv({}, async () => {
    const mod = await loadDownloadLib()
    assert.deepEqual(
      mod.expandSourceOrder(['modelscope', 'huggingface'], { foreign: false }),
      ['modelscope', 'hf-mirror', 'huggingface'],
    )
    assert.deepEqual(
      mod.expandSourceOrder(['huggingface', 'modelscope'], { foreign: true }),
      ['huggingface', 'hf-mirror', 'modelscope'],
    )
  })
})

test('orderSources puts ModelScope before hf-mirror before huggingface.co', async () => {
  await withEnv({
    OPPTRIX_MODEL_SOURCE_ORDER: undefined,
    OPPTRIX_CI_FOREIGN_MIRRORS: '0',
    CI: undefined,
    GITHUB_ACTIONS: undefined,
  }, async () => {
    const mod = await loadDownloadLib()
    const ordered = mod.orderSources([
      {
        kind: 'huggingface',
        label: 'huggingface',
        url: 'https://huggingface.co/tencent/HY-MT1.5-1.8B-GGUF/resolve/main/x.gguf',
      },
      {
        kind: 'modelscope',
        label: 'modelscope-apex',
        url: 'https://modelscope.cn/models/Tencent-Hunyuan/HY-MT1.5-1.8B-GGUF/resolve/master/x.gguf',
      },
      {
        kind: 'hf-mirror',
        label: 'hf-mirror',
        url: 'https://hf-mirror.com/tencent/HY-MT1.5-1.8B-GGUF/resolve/main/x.gguf',
      },
    ])
    assert.deepEqual(
      ordered.map((s) => s.kind),
      ['modelscope', 'hf-mirror', 'huggingface'],
    )
  })
})

test('docker-fetch-models hyMtSources include Tencent-Hunyuan ModelScope', async () => {
  const src = await import('node:fs').then((fs) =>
    fs.promises.readFile(path.join(ROOT, 'scripts/docker-fetch-models.mjs'), 'utf8'),
  )
  assert.match(src, /Tencent-Hunyuan\/HY-MT1\.5-1\.8B-GGUF/)
  assert.match(src, /OPPTRIX_HY_MT_MODELSCOPE_REPO/)
  assert.match(src, /kind: 'modelscope'/)
  assert.match(src, /kind: 'hf-mirror'/)
})

test('local-inference HY-MT catalog urls start with ModelScope', async () => {
  // Dynamic import after build; fall back to reading dist or ts via require dist
  let catalog
  try {
    catalog = await import(
      pathToFileURL(path.join(ROOT, 'packages/local-inference/dist/catalog/models.js')).href
    )
  } catch {
    // rebuild may be needed — also check electron catalog which is plain cjs
    const electron = require(
      path.join(ROOT, 'apps/desktop/electron/translation-model-catalog.cjs'),
    )
    const q4 = electron.getCatalogModel('hy-mt-q4')
    assert.ok(q4)
    assert.equal(q4.urls[0].source, 'modelscope')
    assert.match(q4.urls[0].url, /Tencent-Hunyuan\/HY-MT1\.5-1\.8B-GGUF/)
    assert.equal(q4.urls[1].source, 'hf-mirror')
    assert.equal(q4.urls[2].source, 'huggingface')
    return
  }
  const q4 = catalog.getCatalogModel('hy-mt-q4')
  assert.ok(q4)
  assert.equal(q4.urls[0].source, 'modelscope')
  assert.match(q4.urls[0].url, /Tencent-Hunyuan\/HY-MT1\.5-1\.8B-GGUF/)
  assert.equal(q4.urls[1].source, 'hf-mirror')
  assert.equal(q4.urls[2].source, 'huggingface')
})

test('ModelScope HY-MT Q4 resolve returns redirect (live smoke)', async () => {
  const url =
    'https://www.modelscope.cn/models/Tencent-Hunyuan/HY-MT1.5-1.8B-GGUF/resolve/master/HY-MT1.5-1.8B-Q4_K_M.gguf'
  const resp = await fetch(url, { method: 'HEAD', redirect: 'manual' })
  // 302/301 to CDN, or 200 if served directly
  assert.ok(
    [200, 301, 302, 307, 308].includes(resp.status),
    `unexpected status ${resp.status}`,
  )
})
