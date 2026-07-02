import assert from 'node:assert/strict'
import test from 'node:test'
import { scanHtmlMedia } from '../packages/article-enrichment/dist/html-media-scan.js'

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
