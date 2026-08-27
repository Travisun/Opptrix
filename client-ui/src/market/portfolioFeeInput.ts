/** 存储 rate 小数 → 输入框展示的百分比字符串（0.00025 → "0.025"） */
export function formatFeeRatePercentInput(rate: number | undefined): string {
  const pct = (rate ?? 0) * 100
  if (pct === 0) return '0'
  return pct.toFixed(6).replace(/\.?0+$/, '')
}

/** 百分比输入 → 存储 rate；中间态 "0." / "" 返回 null */
export function parseFeeRatePercentInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '.') return null
  if (!/^\d*\.?\d*$/.test(trimmed)) return null
  if (trimmed.endsWith('.')) return null
  const pct = Number(trimmed)
  if (!Number.isFinite(pct)) return null
  return pct / 100
}

export function formatFeeAmountInput(value: number | undefined): string {
  const n = value ?? 0
  if (n === 0) return '0'
  return String(n)
}

/** 金额输入（最低费 / 固定每笔）；中间态返回 null */
export function parseFeeAmountInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '.') return null
  if (!/^\d*\.?\d*$/.test(trimmed)) return null
  if (trimmed.endsWith('.')) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return n
}

export function isAllowedDecimalDraft(raw: string): boolean {
  return raw === '' || /^\d*\.?\d*$/.test(raw)
}

/** 用户可读：费率如何参与 calcPortfolioTradeFees */
export function describeFeeRateCalc(currencyUnit: string): string {
  return `按成交额 × 费率% 计算；例如 0.025 表示 0.025%（万 2.5），最低费单位为 ${currencyUnit}`
}
