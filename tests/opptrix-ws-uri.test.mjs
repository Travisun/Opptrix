import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  OPPTRIX_WS_SCHEME,
  parseOpptrixWsUri,
  buildOpptrixWsUri,
  isValidOpptrixWsRootId,
  normalizeOpptrixWsRelPath,
  hintOpptrixWsKind,
} from '../packages/shared/dist/opptrix-ws-uri.js'

describe('opptrix-ws URI', () => {
  it('parses shared / default / grant roots', () => {
    assert.equal(OPPTRIX_WS_SCHEME, 'opptrix-ws')
    const a = parseOpptrixWsUri('opptrix-ws://shared/charts/a.png')
    assert.equal(a.ok, true)
    if (a.ok) {
      assert.equal(a.rootId, 'shared')
      assert.equal(a.relPath, 'charts/a.png')
    }
    const b = parseOpptrixWsUri('opptrix-ws://default/out/x.mp4')
    assert.equal(b.ok, true)
    if (b.ok) {
      assert.equal(b.rootId, 'default')
      assert.equal(b.relPath, 'out/x.mp4')
    }
    const c = parseOpptrixWsUri('opptrix-ws://grant_ab12cd34/photos/x.jpg')
    assert.equal(c.ok, true)
    if (c.ok) {
      assert.equal(c.rootId, 'grant_ab12cd34')
      assert.equal(c.relPath, 'photos/x.jpg')
    }
  })

  it('normalizes backslashes and rejects traversal / absolute / empty', () => {
    const n = normalizeOpptrixWsRelPath('charts\\a.png')
    assert.equal(n.ok, true)
    if (n.ok) assert.equal(n.path, 'charts/a.png')

    assert.equal(parseOpptrixWsUri('opptrix-ws://default/../etc/passwd').ok, false)
    assert.equal(parseOpptrixWsUri('opptrix-ws://default//abs').ok, false)
    assert.equal(parseOpptrixWsUri('opptrix-ws://default/').ok, false)
    assert.equal(parseOpptrixWsUri('opptrix-ws://evil/x.png').ok, false)
    assert.equal(isValidOpptrixWsRootId('grant_'), false)
    assert.equal(isValidOpptrixWsRootId('grant_x1'), true)
  })

  it('build round-trips', () => {
    const uri = buildOpptrixWsUri('shared', 'charts/a.png')
    assert.equal(uri, 'opptrix-ws://shared/charts/a.png')
    const parsed = parseOpptrixWsUri(uri)
    assert.equal(parsed.ok, true)
    assert.throws(() => buildOpptrixWsUri('bad', 'a.png'))
    assert.throws(() => buildOpptrixWsUri('default', '../x'))
  })

  it('kind hints', () => {
    assert.equal(hintOpptrixWsKind('a.png'), 'image')
    assert.equal(hintOpptrixWsKind('a.MP4'), 'video')
    assert.equal(hintOpptrixWsKind('a.wav'), 'audio')
    assert.equal(hintOpptrixWsKind('a.pdf'), 'file')
  })
})
