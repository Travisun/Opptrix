/** efinance config — mirrors efinance/common/config.py */

export const EF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64; Trident/7.0; Touch; rv:11.0) like Gecko',
  Accept: '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
}

export const FUND_HEADERS = {
  ...EF_HEADERS,
  'Content-Type': 'application/x-www-form-urlencoded',
}

/** FS filter strings for get_realtime_quotes */
export const FS_DICT: Record<string, string> = {
  bond: 'b:MK0354',
  可转债: 'b:MK0354',
  stock: 'm:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048',
  沪深A股: 'm:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23',
  沪深京A股: 'm:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048',
  futures: 'm:113,m:114,m:115,m:8,m:142,m:225',
  期货: 'm:113,m:114,m:115,m:8,m:142,m:225',
  ETF: 'b:MK0021,b:MK0022,b:MK0023,b:MK0024',
  LOF: 'b:MK0404,b:MK0405,b:MK0406,b:MK0407',
  港股: 'm:128 t:3,m:128 t:4,m:128 t:1,m:128 t:2',
  美股: 'm:105,m:106,m:107',
}

export const QUOTE_FIELDS: Record<string, string> = {
  f12: '代码', f14: '名称', f3: '涨跌幅', f2: '最新价', f15: '最高', f16: '最低',
  f17: '今开', f4: '涨跌额', f8: '换手率', f10: '量比', f9: '动态市盈率',
  f5: '成交量', f6: '成交额', f18: '昨日收盘', f20: '总市值', f21: '流通市值',
  f13: '市场编号',
}

export const KLINE_FIELDS = ['日期', '开盘', '收盘', '最高', '最低', '成交量', '成交额', '振幅', '涨跌幅', '涨跌额', '换手率']
export const KLINE_FIELD_KEYS = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'

export const BASE_INFO_FIELDS: Record<string, string> = {
  f57: '代码', f58: '名称', f162: '市盈率(动)', f167: '市净率', f127: '所处行业',
  f116: '总市值', f117: '流通市值', f173: 'ROE', f187: '净利率', f105: '净利润', f186: '毛利率',
}

export const HISTORY_BILL_FIELDS = [
  '日期', '主力净流入', '小单净流入', '中单净流入', '大单净流入', '超大单净流入',
  '主力净流入占比', '小单流入净占比', '中单流入净占比', '大单流入净占比', '超大单流入净占比',
  '收盘价', '涨跌幅',
]
export const HISTORY_BILL_KEYS = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'

export const MARKET_NUMBER_DICT: Record<string, string> = {
  '0': '深A', '1': '沪A', '105': '美股', '106': '美股', '107': '美股',
  '116': '港股', '128': '港股', '113': '上期所', '114': '大商所', '115': '郑商所',
  '8': '中金所', '90': '板块',
}

/** period name → EastMoney klt */
export const KLT_MAP: Record<string, number> = {
  '1m': 1, '5m': 5, '15m': 15, '30m': 30, '60m': 60,
  daily: 101, weekly: 102, monthly: 103,
}
