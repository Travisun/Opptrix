import assert from 'node:assert/strict'
import test from 'node:test'
import { scanHtmlMedia } from '../packages/article-enrichment/dist/html-media-scan.js'
import { isLowQualityImageExtraction } from '../packages/local-inference/dist/vision/image-quality.js'

test('scanHtmlMedia finds image audio and video sources', () => {
  const html = `
    <p>Hello</p>
    <img src="https://cdn.example.com/a.jpg" />
    <audio src="https://cdn.example.com/pod.mp3"></audio>
    <video><source src="https://cdn.example.com/clip.mp4" type="video/mp4" /></video>
  `
  const items = scanHtmlMedia(html)
  assert.ok(items.some(i => i.kind === 'image'))
  assert.ok(items.some(i => i.kind === 'audio'))
  assert.ok(items.some(i => i.kind === 'video'))
})

test('scanHtmlMedia skips data urls', () => {
  const html = '<img src="data:image/png;base64,abc" />'
  assert.equal(scanHtmlMedia(html).length, 0)
})

test('isLowQualityImageExtraction flags garbage OCR', () => {
  assert.equal(isLowQualityImageExtraction(''), true)
  assert.equal(isLowQualityImageExtraction('这是一段正常的中文图片摘要，包含图表数据。'), false)
  assert.equal(isLowQualityImageExtraction('Extract all visible text in this image'), true)
})
