/**
 * Message outline preview — strip chart fences before tooltip markdown.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHART_PREVIEW_PLACEHOLDER,
  buildOutlineSummary,
  buildPreviewMarkdown,
  stripChartFencesForPreview,
} from '../client-ui/src/chat/messageOutlinePreview.ts'

const SAMPLE_CHART = `\`\`\`chart
{"type":"line","data":[{"label":"Q1","value":10},{"label":"Q2","value":12}]}
\`\`\``

const SAMPLE_OPPTRIX = `\`\`\`Opptrix-Chart
{"type":"bar","data":[{"label":"A","value":1}]}
\`\`\``

describe('stripChartFencesForPreview', () => {
  it('removes chart fence and keeps surrounding prose', () => {
    const md = `先看结论。\n\n${SAMPLE_CHART}\n\n营收环比上升。`
    const out = stripChartFencesForPreview(md)
    assert.match(out, /先看结论/)
    assert.match(out, /营收环比上升/)
    assert.doesNotMatch(out, /```/)
    assert.doesNotMatch(out, /"type"\s*:\s*"line"/)
  })

  it('is case-insensitive for chart / opptrix-chart', () => {
    const out = stripChartFencesForPreview(`摘要\n\n${SAMPLE_OPPTRIX}\n\n尾部`)
    assert.match(out, /摘要/)
    assert.match(out, /尾部/)
    assert.doesNotMatch(out, /"type"/)
  })

  it('returns placeholder when body is only chart fences', () => {
    assert.equal(stripChartFencesForPreview(SAMPLE_CHART), CHART_PREVIEW_PLACEHOLDER)
    assert.equal(
      stripChartFencesForPreview(`${SAMPLE_CHART}\n\n${SAMPLE_OPPTRIX}`),
      CHART_PREVIEW_PLACEHOLDER,
    )
  })

  it('strips unclosed trailing chart fence (no half JSON)', () => {
    const md = `说明文字\n\n\`\`\`chart\n{"type":"line","data":[`
    const out = stripChartFencesForPreview(md)
    assert.equal(out, '说明文字')
    assert.doesNotMatch(out, /\{/)
  })
})

describe('buildPreviewMarkdown', () => {
  it('does not leave chart JSON in truncated preview', () => {
    const longProse = '分析结论。'.repeat(40)
    const md = `${SAMPLE_CHART}\n\n${longProse}`
    const preview = buildPreviewMarkdown(md, 80)
    assert.doesNotMatch(preview, /```/)
    assert.doesNotMatch(preview, /"data"/)
    assert.match(preview, /分析结论/)
  })

  it('uses placeholder when only charts', () => {
    assert.equal(buildPreviewMarkdown(SAMPLE_CHART), CHART_PREVIEW_PLACEHOLDER)
  })
})

describe('buildOutlineSummary', () => {
  it('does not put chart JSON into aria summary', () => {
    const md = `${SAMPLE_CHART}\n\n这是可读摘要文字。`
    const summary = buildOutlineSummary(md)
    assert.equal(summary, '这是可读摘要文字。')
    assert.doesNotMatch(summary, /\{/)
  })

  it('uses placeholder for chart-only messages', () => {
    assert.equal(buildOutlineSummary(SAMPLE_CHART), CHART_PREVIEW_PLACEHOLDER)
  })
})
