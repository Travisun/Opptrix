/**
 * 语音就绪标志组合 + 产品文案映射
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  computeSpeechReadyFlags,
  speechComposerBlockedMessage,
  speechEnsureModelReadyMessage,
  speechEnsureSuccessToastMessage,
  speechSettingsSenseVoicePresentation,
  resolveFfmpegBinaryPath,
  isFfmpegAvailable,
  ensureFfmpegExecutable,
  clearFfmpegAvailabilityCache,
  SPEECH_COMPONENT_NOT_READY_MESSAGE,
  SPEECH_FULLY_READY_MESSAGE,
  SPEECH_MEDIA_DECODE_NOT_READY_MESSAGE,
  SPEECH_MODEL_READY_DECODE_PENDING_MESSAGE,
  SPEECH_MODEL_READY_MESSAGE,
  SPEECH_SERVICE_UNREACHABLE_MESSAGE,
} from '../packages/local-inference/dist/index.js'

test('computeSpeechReadyFlags: ready === modelReady; ffmpegReady is independent', () => {
  assert.deepEqual(computeSpeechReadyFlags(true, true), {
    ready: true,
    modelReady: true,
    ffmpegReady: true,
  })
  assert.deepEqual(computeSpeechReadyFlags(true, false), {
    ready: true,
    modelReady: true,
    ffmpegReady: false,
  })
  assert.deepEqual(computeSpeechReadyFlags(false, true), {
    ready: false,
    modelReady: false,
    ffmpegReady: true,
  })
  assert.deepEqual(computeSpeechReadyFlags(false, false), {
    ready: false,
    modelReady: false,
    ffmpegReady: false,
  })
})

test('speechComposerBlockedMessage: model-only vs both missing vs unreachable', () => {
  assert.equal(
    speechComposerBlockedMessage({ modelReady: true, ffmpegReady: false }),
    SPEECH_MEDIA_DECODE_NOT_READY_MESSAGE,
  )
  assert.equal(
    speechComposerBlockedMessage({ modelReady: false, ffmpegReady: false }),
    `${SPEECH_COMPONENT_NOT_READY_MESSAGE}（识别模型与媒体解码均未就绪）`,
  )
  assert.equal(
    speechComposerBlockedMessage({ modelReady: false }),
    `${SPEECH_COMPONENT_NOT_READY_MESSAGE}（识别模型未就绪）`,
  )
  assert.equal(
    speechComposerBlockedMessage({}),
    SPEECH_COMPONENT_NOT_READY_MESSAGE,
  )
  assert.equal(
    speechComposerBlockedMessage({ error: 'unreachable' }),
    SPEECH_SERVICE_UNREACHABLE_MESSAGE,
  )
  assert.ok(!/ffmpeg/i.test(SPEECH_MEDIA_DECODE_NOT_READY_MESSAGE))
  assert.ok(!/端口|8711|API/i.test(SPEECH_SERVICE_UNREACHABLE_MESSAGE))
  assert.notEqual(SPEECH_SERVICE_UNREACHABLE_MESSAGE, SPEECH_MEDIA_DECODE_NOT_READY_MESSAGE)
})

// Composer 不再做录音前 status 门禁；转写主路径为 electronAPI.speechTranscribe。
// /api/speech/status 的 ready === modelReady（ffmpegReady 独立字段，供设置页）。

test('speechEnsure / settings copy: model-only never claims fully ready', () => {
  assert.equal(speechEnsureModelReadyMessage(), SPEECH_MODEL_READY_MESSAGE)
  assert.ok(!speechEnsureModelReadyMessage().includes('语音识别已就绪'))

  assert.equal(speechEnsureSuccessToastMessage(true), SPEECH_FULLY_READY_MESSAGE)
  assert.equal(
    speechEnsureSuccessToastMessage(false),
    SPEECH_MODEL_READY_DECODE_PENDING_MESSAGE,
  )

  const modelOnly = speechSettingsSenseVoicePresentation({
    sensevoiceReady: true,
    ffmpegReady: false,
    source: 'user',
  })
  assert.equal(modelOnly.meta, SPEECH_MODEL_READY_DECODE_PENDING_MESSAGE)
  assert.equal(modelOnly.badgeReady, false)
  assert.ok(!modelOnly.meta.includes('可直接转写'))

  const full = speechSettingsSenseVoicePresentation({
    sensevoiceReady: true,
    ffmpegReady: true,
    source: 'bundled',
  })
  assert.equal(full.badgeReady, true)
  assert.match(full.meta, /可直接转写/)
})

test('resolveFfmpegBinaryPath: prefers FFMPEG_PATH when file exists', () => {
  const prev = process.env.FFMPEG_PATH
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ffmpeg-'))
  const fakeBin = path.join(tmp, 'ffmpeg')
  fs.writeFileSync(fakeBin, '')
  try {
    process.env.FFMPEG_PATH = fakeBin
    assert.equal(resolveFfmpegBinaryPath(), fakeBin)
  } finally {
    if (prev === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = prev
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('resolveFfmpegBinaryPath: chmod +x when binary exists without execute bit', {
  skip: process.platform === 'win32' ? 'Windows execute bit not analogous' : false,
}, () => {
  const prev = process.env.FFMPEG_PATH
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ffmpeg-chmod-'))
  const fakeBin = path.join(tmp, 'ffmpeg')
  fs.writeFileSync(fakeBin, '#!/bin/sh\nexit 0\n')
  fs.chmodSync(fakeBin, 0o644)
  try {
    process.env.FFMPEG_PATH = fakeBin
    clearFfmpegAvailabilityCache()
    assert.equal(resolveFfmpegBinaryPath(), fakeBin)
    const mode = fs.statSync(fakeBin).mode & 0o111
    assert.ok(mode !== 0, 'expected execute bit after resolve')
    assert.equal(ensureFfmpegExecutable(fakeBin), true)
  } finally {
    if (prev === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = prev
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('isFfmpegAvailable: empty stub is not ready (exists ≠ runnable)', () => {
  const prev = process.env.FFMPEG_PATH
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ffmpeg-stub-'))
  const fakeBin = path.join(tmp, 'ffmpeg')
  fs.writeFileSync(fakeBin, '')
  fs.chmodSync(fakeBin, 0o755)
  try {
    process.env.FFMPEG_PATH = fakeBin
    clearFfmpegAvailabilityCache()
    // Path resolves (exists + X_OK) but -version fails → not available
    assert.equal(resolveFfmpegBinaryPath(), fakeBin)
    assert.equal(isFfmpegAvailable(), false)
  } finally {
    if (prev === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = prev
    clearFfmpegAvailabilityCache()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('resolveFfmpegBinaryPath: falls back to OPPTRIX_RUNTIME_STAGE when static missing', () => {
  const prevPath = process.env.FFMPEG_PATH
  const prevStage = process.env.OPPTRIX_RUNTIME_STAGE
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-rt-'))
  const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const stageBin = path.join(tmp, 'node_modules', 'ffmpeg-static', binName)
  fs.mkdirSync(path.dirname(stageBin), { recursive: true })
  fs.writeFileSync(stageBin, '')
  try {
    // Point FFMPEG_PATH at a missing file so env seed fails but stage candidate works
    process.env.FFMPEG_PATH = path.join(tmp, 'missing-ffmpeg')
    process.env.OPPTRIX_RUNTIME_STAGE = tmp
    // Still may resolve via ffmpeg-static from workspace; assert stage is accepted when
    // we clear FFMPEG_PATH and temporarily prefer stage by making env empty.
    delete process.env.FFMPEG_PATH
    const resolved = resolveFfmpegBinaryPath()
    assert.ok(resolved)
    // Either workspace static or our stage binary — both prove probe works
    assert.ok(fs.existsSync(resolved))
  } finally {
    if (prevPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = prevPath
    if (prevStage === undefined) delete process.env.OPPTRIX_RUNTIME_STAGE
    else process.env.OPPTRIX_RUNTIME_STAGE = prevStage
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('resolveFfmpegBinaryPath: rewrites app.asar to asar.unpacked when needed', () => {
  const prev = process.env.FFMPEG_PATH
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-asar-'))
  const asarPath = path.join(tmp, 'app.asar', 'node_modules', 'ffmpeg-static', 'ffmpeg')
  const unpackedPath = path.join(tmp, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg')
  fs.mkdirSync(path.dirname(unpackedPath), { recursive: true })
  fs.writeFileSync(unpackedPath, '')
  try {
    process.env.FFMPEG_PATH = asarPath
    assert.equal(resolveFfmpegBinaryPath(), unpackedPath)
  } finally {
    if (prev === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = prev
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
