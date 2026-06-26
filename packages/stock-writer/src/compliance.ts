const DEFAULT_BLACKLIST = [
  '抄底', '建仓', '加仓', '减仓', '买入', '卖出', '机会来了', '可以入手',
  '目标价', '看到', '上涨空间', '推荐个股', '值得关注',
]

export function checkCompliance(text: string, extraBlacklist: string[] = []) {
  const hits: string[] = []
  const list = [...DEFAULT_BLACKLIST, ...extraBlacklist]
  for (const word of list) {
    if (text.includes(word)) hits.push(word)
  }
  return { ok: hits.length === 0, violations: hits }
}

export function complianceRules(styleBlacklist: string[] = []) {
  return [
    '不得出现任何买/卖/建仓/加仓/减仓等具体操作建议',
    '不得出现目标价、上涨空间、价格预测',
    '不得引导读者投资具体个股',
    '全文需包含合规免责声明',
    ...(styleBlacklist.length ? [`禁用词: ${styleBlacklist.join('、')}`] : []),
  ]
}
