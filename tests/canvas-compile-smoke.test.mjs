/**
 * Canvas / mindmap smoke — curated exports + CSS dist + mindmap JSON shape.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Surface,
  Stack,
  Stat,
  Table,
  Card,
  Chart,
  H1,
  Code,
  Link,
  Button,
  Pill,
  Callout,
  Text,
  useCanvasTheme,
} from '../packages/canvas-kit/dist/index.js'
import { compileCanvasSource } from '../client-ui/src/chat/compileCanvasSource.ts'
import {
  parseMindmapJson,
  serializeMindmapDoc,
} from '../client-ui/src/chat/mindmapDocument.ts'
import {
  elixirDataToMindmapDoc,
  mindmapDocToElixir,
} from '../client-ui/src/chat/mindmapElixirBridge.ts'

const canvasDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/canvas-kit/dist',
)

describe('canvas-kit curated exports', () => {
  it('exports Surface / Stack / Stat / Table / Card / Chart / H1 / Code / Link / useCanvasTheme', () => {
    assert.equal(typeof Surface, 'function')
    assert.equal(typeof Stack, 'function')
    assert.equal(typeof Stat, 'function')
    assert.equal(typeof Table, 'function')
    assert.equal(typeof Card, 'function')
    assert.equal(typeof Chart, 'function')
    assert.equal(typeof H1, 'function')
    assert.equal(typeof Code, 'function')
    assert.equal(typeof Link, 'function')
    assert.equal(typeof Button, 'function')
    assert.equal(typeof Pill, 'function')
    assert.equal(typeof Callout, 'function')
    assert.equal(typeof Text, 'function')
    assert.equal(typeof useCanvasTheme, 'function')
  })

  it('ships styles.css as the only stylesheet in dist', () => {
    assert.ok(existsSync(path.join(canvasDist, 'styles.css')), 'styles.css')
    const cssFiles = readdirSync(canvasDist).filter((n) => n.endsWith('.css'))
    assert.deepEqual(cssFiles, ['styles.css'])
  })

  it('compiles Chart type=heatmap with row/col data', () => {
    const source = `
import { Surface, Chart } from '@opptrix/canvas'
export default function Report() {
  return (
    <Surface>
      <Chart
        type="heatmap"
        title="强度矩阵"
        data={[
          { label: 'a', row: '北', col: 'Q1', value: 1 },
          { label: 'b', row: '北', col: 'Q2', value: 3 },
          { label: 'c', row: '南', col: 'Q1', value: 2 },
          { label: 'd', row: '南', col: 'Q2', value: 4 },
        ]}
      />
    </Surface>
  )
}
`
    const result = compileCanvasSource(source)
    assert.equal(result.ok, true, result.ok ? '' : result.error)
  })

  it('compiles Chart bar/line/pie with professional annotation props', () => {
    const source = `
import { Surface, Stack, Chart } from '@opptrix/canvas'
export default function Report() {
  const data = [
    { label: 'Q1', value: 10.2 },
    { label: 'Q2', value: 12.4 },
  ]
  return (
    <Surface>
      <Stack gap="16px">
        <Chart type="bar" data={data} showValues showAxis showGrid showTooltip />
        <Chart type="line" data={data} />
        <Chart type="pie" data={data} showLegend={false} />
      </Stack>
    </Surface>
  )
}
`
    const result = compileCanvasSource(source)
    assert.equal(result.ok, true, result.ok ? '' : result.error)
  })

  it('rejects direct echarts import in canvas source', () => {
    const source = `
import { Surface } from '@opptrix/canvas'
import * as echarts from 'echarts'
export default function Report() {
  return <Surface>{String(!!echarts)}</Surface>
}
`
    const result = compileCanvasSource(source)
    assert.equal(result.ok, false)
  })
})

describe('mindmap document format', () => {
  it('parses version + rootId + nodes', () => {
    const json = JSON.stringify({
      version: 1,
      rootId: 'root',
      nodes: [
        { id: 'root', parentId: null, label: '主题' },
        { id: 'a', parentId: 'root', label: '分支', note: '备注' },
      ],
    })
    const parsed = parseMindmapJson(json)
    assert.ok(!('error' in parsed))
    assert.equal(parsed.version, 1)
    assert.equal(parsed.rootId, 'root')
    assert.equal(parsed.nodes.length, 2)
    assert.equal(parsed.nodes[1]?.note, '备注')
  })

  it('defaults version when omitted', () => {
    const parsed = parseMindmapJson(JSON.stringify({
      rootId: 'r',
      nodes: [{ id: 'r', parentId: null, label: '根' }],
    }))
    assert.ok(!('error' in parsed))
    assert.equal(parsed.version, 1)
  })

  it('rejects missing root', () => {
    const parsed = parseMindmapJson(JSON.stringify({
      version: 1,
      nodes: [{ id: 'a', parentId: null, label: 'x' }],
    }))
    assert.ok('error' in parsed)
  })

  it('serialize round-trip matches create_mindmap shape', () => {
    const doc = {
      version: 1,
      rootId: 'root',
      nodes: [
        { id: 'root', parentId: null, label: '主题' },
        { id: 'c1', parentId: 'root', label: '子节点' },
      ],
    }
    const out = serializeMindmapDoc(doc)
    assert.deepEqual(Object.keys(out).sort(), ['nodes', 'rootId', 'version'])
    const again = parseMindmapJson(JSON.stringify(out))
    assert.ok(!('error' in again))
    assert.deepEqual(again, out)
  })
})

describe('mindmap ↔ mind-elixir bridge', () => {
  it('round-trips flat nodes with note via topic/note', () => {
    const doc = {
      version: 1,
      rootId: 'root',
      nodes: [
        { id: 'root', parentId: null, label: '主题' },
        { id: 'a', parentId: 'root', label: '分支', note: '备注' },
        { id: 'b', parentId: 'a', label: '叶子' },
      ],
    }
    const elixir = mindmapDocToElixir(doc)
    assert.equal(elixir.nodeData.id, 'root')
    assert.equal(elixir.nodeData.topic, '主题')
    assert.equal(elixir.nodeData.children?.[0]?.id, 'a')
    assert.equal(elixir.nodeData.children?.[0]?.topic, '分支')
    assert.equal(elixir.nodeData.children?.[0]?.note, '备注')
    assert.equal(elixir.nodeData.children?.[0]?.children?.[0]?.id, 'b')

    const back = elixirDataToMindmapDoc(elixir, 1)
    assert.equal(back.version, 1)
    assert.equal(back.rootId, 'root')
    assert.equal(back.nodes.length, 3)
    const byId = Object.fromEntries(back.nodes.map((n) => [n.id, n]))
    assert.equal(byId.root?.label, '主题')
    assert.equal(byId.root?.parentId, null)
    assert.equal(byId.a?.label, '分支')
    assert.equal(byId.a?.parentId, 'root')
    assert.equal(byId.a?.note, '备注')
    assert.equal(byId.b?.parentId, 'a')
  })

  it('degrades safely on cycle / empty', () => {
    const cyclic = mindmapDocToElixir({
      version: 1,
      rootId: 'r',
      nodes: [
        { id: 'r', parentId: 'a', label: '根' },
        { id: 'a', parentId: 'r', label: '环' },
      ],
    })
    assert.equal(cyclic.nodeData.id, 'r')
    assert.ok(Array.isArray(cyclic.nodeData.children) || cyclic.nodeData.children == null)

    const empty = elixirDataToMindmapDoc(null, 1)
    assert.equal(empty.rootId, 'root')
    assert.equal(empty.nodes.length, 1)
    assert.equal(empty.nodes[0]?.label, '脑图')
  })
})
