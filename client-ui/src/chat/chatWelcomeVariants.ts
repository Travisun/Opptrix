export interface ChatWelcomeVariant {
  title: string
  subtitle: string
  starters: string[]
}

export const CHAT_WELCOME_VARIANTS: ChatWelcomeVariant[] = [
  {
    title: '想从哪开始？',
    subtitle: '可以问个股、行业或持仓，也可以从下方选一句直接提问',
    starters: [
      '茅台现在估值贵不贵？适合长期关注吗？',
      '帮我找几只赚钱稳、负债不高的股票',
      '今天大盘怎么样？哪些板块比较强？',
      '半导体产业链有哪些值得一看的龙头？',
    ],
  },
  {
    title: '今天想聊点什么？',
    subtitle: '个股估值、板块强弱、持仓盈亏，都可以从这里开口',
    starters: [
      '宁德时代最近走势怎么看？',
      '帮我筛几只现金流好、分红稳的标的',
      '消费和科技板块，现在哪个更值得看？',
      '我持仓偏集中，怎么判断要不要减仓？',
    ],
  },
  {
    title: '有什么想先弄清楚的？',
    subtitle: '不懂的名词、看不懂的公告、拿不准的买卖，都可以先问我',
    starters: [
      '比亚迪这份季报里，有哪些值得关注的点？',
      '医药板块最近为什么波动这么大？',
      '沪深300现在位置高不高？',
      '帮我看看关注列表里今天谁比较强',
    ],
  },
  {
    title: '从你最关心的事开始',
    subtitle: '单只股票、一个行业，或你今天最在意的市场变化都行',
    starters: [
      '人工智能相关股票，现在还能不能追？',
      '银行板块分红高，适合长期拿着吗？',
      '今天北向资金在买什么方向？',
      '帮我对比一下几只白酒龙头的估值',
    ],
  },
  {
    title: '随时可以开始提问',
    subtitle: '不用组织成长篇大论，一句话描述你的问题就可以',
    starters: [
      '光伏行业是不是还在底部区域？',
      '这只股票跌停了，一般该怎么理解？',
      '帮我找几只盈利能力强、负债又低的股票',
      '收盘后今天市场最值得复盘的是什么？',
    ],
  },
]

export function pickWelcomeVariant(epoch: number): ChatWelcomeVariant {
  const list = CHAT_WELCOME_VARIANTS
  const index = ((epoch % list.length) + list.length) % list.length
  return list[index]!
}
