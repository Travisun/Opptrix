/** Map aaashare period names → nodetdx period codes */
const PERIOD_MAP: Record<string, string> = {
  daily: 'D',
  weekly: 'W',
  monthly: 'M',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '60m': 'H',
}

export function toTdxPeriod(period: string): string {
  return PERIOD_MAP[period] ?? 'D'
}
