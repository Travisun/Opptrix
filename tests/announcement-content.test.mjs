import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compressPlainTextForAgent,
  truncatePlainTextForAgent,
  resolveAnnouncementUrl,
} from '../packages/a-stock-layer/dist/announcement/index.js'

test('resolveAnnouncementUrl detects sina bulletin and memord', () => {
  const bulletin = resolveAnnouncementUrl(
    'https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?stockid=600905&id=12419343',
  )
  assert.equal(bulletin?.kind, 'sina_bulletin')
  assert.equal(bulletin && 'code' in bulletin ? bulletin.code : '', '600905')

  const memord = resolveAnnouncementUrl(
    'https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllMemordDetail.php?stockid=600905#_10351920',
  )
  assert.equal(memord?.kind, 'sina_memord')
  assert.equal(memord && 'noticeId' in memord ? memord.noticeId : '', '10351920')
})

test('resolveAnnouncementUrl detects tencent notice and pdf', () => {
  const tencent = resolveAnnouncementUrl('https://gu.qq.com/sz300308/gp/notice/nos1225368701')
  assert.equal(tencent?.kind, 'tencent_notice')
  assert.equal(tencent && 'code' in tencent ? tencent.code : '', '300308')

  const pdf = resolveAnnouncementUrl('https://static.cninfo.com.cn/finalpage/2024-03-28/1219398849.PDF')
  assert.equal(pdf?.kind, 'pdf')
})

test('compressPlainTextForAgent strips html and collapses whitespace', () => {
  const out = compressPlainTextForAgent('<p>公告&nbsp;正文</p>\n\n<p>第二段</p>')
  assert.ok(out.includes('公告 正文'))
  assert.ok(out.includes('第二段'))
})

test('truncatePlainTextForAgent marks truncation', () => {
  const long = '甲'.repeat(100)
  const { text, truncated, charCount } = truncatePlainTextForAgent(long, 40)
  assert.equal(truncated, true)
  assert.equal(charCount, 100)
  assert.ok(text.includes('已截断'))
})
