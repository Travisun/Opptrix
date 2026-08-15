/**
 * 网页预览导出：长图 PDF 切页计划 + loopback URL 构建 + 导出分辨率常量
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { planLongImagePdfSlices } from '../client-ui/src/chat/previewExport.ts'
import {
  buildLoopbackWebPreviewUrl,
  htmlFileUrl,
  EXPORT_VIEWPORT_WIDTH,
  EXPORT_VIEWPORT_HEIGHT,
  EXPORT_DEVICE_SCALE_FACTOR,
} from '../apps/server/dist/web-preview-export.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

describe('planLongImagePdfSlices', () => {
  it('returns empty slices for non-positive size', () => {
    assert.deepEqual(planLongImagePdfSlices(0, 100).slices, [])
    assert.deepEqual(planLongImagePdfSlices(100, 0).slices, [])
  })

  it('fits short portrait into one slice', () => {
    // A4 content ~194x281 mm; at width 800px scale = 194/800, pageContentHeight ≈ 281/scale
    const { slices } = planLongImagePdfSlices(800, 600)
    assert.equal(slices.length, 1)
    assert.equal(slices[0].y, 0)
    assert.equal(slices[0].height, 600)
  })

  it('splits tall image into multiple vertical slices covering full height', () => {
    const width = 800
    const height = 5000
    const { slices } = planLongImagePdfSlices(width, height)
    assert.ok(slices.length >= 2)
    assert.equal(slices[0].y, 0)
    const covered = slices.reduce((sum, s) => sum + s.height, 0)
    assert.equal(covered, height)
    const last = slices[slices.length - 1]
    assert.equal(last.y + last.height, height)
  })
})

describe('buildLoopbackWebPreviewUrl', () => {
  it('maps 0.0.0.0 / :: to 127.0.0.1 and encodes ids', () => {
    const url = buildLoopbackWebPreviewUrl('0.0.0.0', 8711, 'sess/a', 'att b')
    assert.equal(
      url,
      'http://127.0.0.1:8711/api/sessions/sess%2Fa/attachments/att%20b/web/index.html',
    )
    const url6 = buildLoopbackWebPreviewUrl('::', 9000, 's1', 'a1')
    assert.match(url6, /^http:\/\/127\.0\.0\.1:9000\//)
  })

  it('htmlFileUrl uses pathToFileURL (cross-platform)', () => {
    const abs = path.join('/tmp', 'opptrix-web', 'index.html')
    assert.equal(htmlFileUrl(abs), pathToFileURL(abs).href)
  })
})

describe('web preview export resolution constants', () => {
  it('uses fixed viewport and 3x clear export scale, independent of client window', () => {
    assert.equal(EXPORT_VIEWPORT_WIDTH, 1280)
    assert.equal(EXPORT_VIEWPORT_HEIGHT, 720)
    assert.ok(EXPORT_DEVICE_SCALE_FACTOR >= 3)
    // PNG 逻辑像素宽 ≈ viewportWidth × deviceScaleFactor
    assert.equal(EXPORT_VIEWPORT_WIDTH * EXPORT_DEVICE_SCALE_FACTOR, 3840)
  })
})
