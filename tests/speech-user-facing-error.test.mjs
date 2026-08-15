/**
 * 语音识别用户文案映射 — ffmpeg 缺失 ≠ 文件损坏
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FFMPEG_FILE_ERROR_MARKER,
  FFMPEG_MISSING_MARKER,
  mediaTranscriptUserFacingError,
  speechUserFacingError,
} from '../packages/local-inference/dist/index.js'

test('speechUserFacingError: missing component is not a file error', () => {
  const msg = speechUserFacingError(new Error(`${FFMPEG_MISSING_MARKER}: 未找到可执行文件`), 'sensevoice')
  assert.match(msg, /语音识别组件尚未就绪/)
  assert.match(msg, /设置/)
  assert.ok(!msg.includes('无法处理该文件'))
  assert.ok(!/ffmpeg|Whisper|SenseVoice/i.test(msg))
})

test('speechUserFacingError: no execute permission maps to component not ready', () => {
  const msg = speechUserFacingError(
    new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件无执行权限`),
    'sensevoice',
  )
  assert.match(msg, /语音识别组件尚未就绪/)
  assert.ok(!msg.includes('无法处理该文件'))
  assert.ok(!/EACCES|chmod|执行权限/i.test(msg))
})

test('speechUserFacingError: legacy ffmpeg missing string maps to component not ready', () => {
  const msg = speechUserFacingError(new Error('未找到 ffmpeg 可执行文件（ffmpeg-static）'), 'sensevoice')
  assert.match(msg, /语音识别组件尚未就绪/)
  assert.ok(!msg.includes('无法处理该文件'))
})

test('speechUserFacingError: legacy ffmpeg exited maps to component not ready', () => {
  const msg = speechUserFacingError(new Error('ffmpeg exited 1'), 'whisper')
  assert.match(msg, /语音识别组件尚未就绪/)
  assert.ok(!msg.includes('无法处理该文件'))
})

test('speechUserFacingError: real media file errors keep file copy', () => {
  const msg = speechUserFacingError(
    new Error(`${FFMPEG_FILE_ERROR_MARKER}: 无法解析该媒体文件`),
    'sensevoice',
  )
  assert.match(msg, /无法处理该文件/)
  assert.ok(!msg.includes('组件尚未就绪'))
})

test('mediaTranscriptUserFacingError: mirrors component vs file split', () => {
  assert.match(
    mediaTranscriptUserFacingError(new Error(`${FFMPEG_MISSING_MARKER}: x`)),
    /语音识别组件尚未就绪/,
  )
  assert.match(
    mediaTranscriptUserFacingError(new Error(`${FFMPEG_FILE_ERROR_MARKER}: bad`)),
    /无法处理该文件/,
  )
  assert.match(
    mediaTranscriptUserFacingError(new Error('该文件没有可用的声音')),
    /没有可用的声音/,
  )
})
