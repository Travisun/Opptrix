import { describe, expect, it } from 'vitest'
import {
  mapTencentBoardRankRows,
  mapTencentHyNewsRows,
  mapTencentJiankuangProfile,
  mapTencentNoticeRows,
  mapTencentResearchReportRows,
  mapTencentTodayFundFlow,
  resolveTencentNewsChannel,
} from '../src/providers/tencent/normalize/content.js'
import { buildTencentReportDetailUrl } from '../src/providers/tencent/api/proxy.js'

describe('mapTencentResearchReportRows', () => {
  it('maps id to gu.qq.com detail url', () => {
    const rows = mapTencentResearchReportRows('300308', [{
      id: 'res835664472733',
      title: '【太平洋证券】中际旭创(300308)：业绩持续超预期',
      time: '2026-06-23 00:00:00',
      typeStr: '年度点评',
      tzpj: '买入',
    }])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.type).toBe('研报')
    expect(rows[0]?.url).toBe(buildTencentReportDetailUrl('res835664472733'))
    expect(rows[0]?.date).toBe('2026-06-23')
    expect(rows[0]?.category).toBe('年度点评')
  })
})

describe('mapTencentNoticeRows', () => {
  it('builds notice page url when upstream url empty', () => {
    const rows = mapTencentNoticeRows('300308', [{
      id: 'nos1225368701',
      title: '中际旭创：关于选举第六届董事会职工代表董事的公告',
      time: '2026-06-12 18:32:11',
    }])
    expect(rows[0]?.url).toContain('/gp/notice/nos1225368701')
    expect(rows[0]?.type).toBe('公告')
  })
})

describe('mapTencentHyNewsRows', () => {
  it('keeps provided article url', () => {
    const url = 'https://gu.qq.com/resources/shy/news/detail-v2/index.html#/index?id=nesSN1&s=b'
    const rows = mapTencentHyNewsRows('300308', [{
      title: '行业动态',
      url,
      pub_time: '2026-07-07 20:32:55',
    }])
    expect(rows[0]?.url).toBe(url)
    expect(rows[0]?.type).toBe('新闻')
  })
})

describe('mapTencentBoardRankRows', () => {
  it('strips market prefix from code', () => {
    const rows = mapTencentBoardRankRows([{
      code: 'sz300308',
      name: '中际旭创',
      stock_type: 'GP-A-CYB',
    }])
    expect(rows[0]?.code).toBe('300308')
    expect(rows[0]?.industry).toBe('CYB')
  })
})

describe('mapTencentJiankuangProfile', () => {
  it('maps company brief and concepts', () => {
    const profile = mapTencentJiankuangProfile('300308', {
      gsjj: {
        gsmz: '中际旭创股份有限公司',
        yw: '光模块设备制造',
        dy: '山东',
        riqi: '2012-04-10',
        plate: [{ name: '通信设备', level: '2' }],
        concept: [{ name: '5G概念' }, { name: '芯片概念' }],
      },
      zyzb: {
        detail: { date: '2026一季报', mgsy: '5.18元', jlrzzl: '262.28%' },
      },
    })
    expect(profile?.orgName).toContain('中际旭创')
    expect(profile?.industry).toBe('通信设备')
    expect(profile?.concepts).toEqual(['5G概念', '芯片概念'])
    expect(profile?.listingDate).toBe('2012-04-10')
  })
})

describe('resolveTencentNewsChannel', () => {
  it('routes research aliases', () => {
    expect(resolveTencentNewsChannel('研报')).toBe('research')
    expect(resolveTencentNewsChannel('yjbg')).toBe('research')
  })
  it('defaults to industry news', () => {
    expect(resolveTencentNewsChannel('')).toBe('industry')
    expect(resolveTencentNewsChannel('all')).toBe('industry')
  })
})
