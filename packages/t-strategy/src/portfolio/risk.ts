/** Risk management utilities */

export function volatilityTargetPosition(currentVol: number, targetVol = 0.2, maxLeverage = 1) {
  if (currentVol <= 0) return 0
  return Math.min(maxLeverage, targetVol / currentVol)
}

export function fixedStopLoss(
  entryPrice: number, currentPrice: number, stopLossPct = 0.07, direction: 'long' | 'short' = 'long',
) {
  if (direction === 'long') {
    const stopPrice = entryPrice * (1 - stopLossPct)
    return { triggered: currentPrice <= stopPrice, stopPrice }
  }
  const stopPrice = entryPrice * (1 + stopLossPct)
  return { triggered: currentPrice >= stopPrice, stopPrice }
}

export function trailingStop(currentPrice: number, peakPrice: number, trailPct = 0.08) {
  const stopPrice = peakPrice * (1 - trailPct)
  return { triggered: currentPrice <= stopPrice, stopPrice }
}

export function positionSizing(
  accountValue: number, riskPerTrade = 0.01, entryPrice = 0, stopPrice = 0,
) {
  if (entryPrice <= 0 || stopPrice <= 0 || entryPrice <= stopPrice) return 0
  const riskPerShare = entryPrice - stopPrice
  return Math.max(0, Math.floor((accountValue * riskPerTrade) / riskPerShare))
}

export function valueAtRisk(returns: number[], confidence = 0.95) {
  if (!returns.length) return 0
  const mu = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, r) => a + (r - mu) ** 2, 0) / returns.length
  const sigma = Math.sqrt(variance)
  // z ≈ 1.645 for 95%
  const z = confidence >= 0.99 ? 2.326 : confidence >= 0.95 ? 1.645 : 1.282
  return mu - sigma * z
}

export function maxDrawdown(prices: number[]) {
  let peak = prices[0] ?? 0
  let maxDd = 0
  let peakIdx = 0
  let valleyIdx = 0
  for (let i = 0; i < prices.length; i++) {
    if (prices[i] > peak) { peak = prices[i]; peakIdx = i }
    const dd = peak > 0 ? (prices[i] - peak) / peak : 0
    if (dd < maxDd) { maxDd = dd; valleyIdx = i }
  }
  return { maxDrawdown: maxDd, peakIdx, valleyIdx }
}

export function sharpeRatio(returns: number[], rf = 0.02) {
  if (returns.length < 2) return 0
  const dailyRf = rf / 252
  const excess = returns.map(r => r - dailyRf)
  const mean = excess.reduce((a, b) => a + b, 0) / excess.length
  const std = Math.sqrt(excess.reduce((a, r) => a + (r - mean) ** 2, 0) / (excess.length - 1))
  return std === 0 ? 0 : (mean / std) * Math.sqrt(252)
}

export function sortinoRatio(returns: number[], rf = 0.02) {
  const dailyRf = rf / 252
  const excess = returns.map(r => r - dailyRf)
  const mean = excess.reduce((a, b) => a + b, 0) / excess.length
  const downside = excess.filter(r => r < 0)
  if (!downside.length) return 0
  const std = Math.sqrt(downside.reduce((a, r) => a + r ** 2, 0) / downside.length)
  return std === 0 ? 0 : (mean / std) * Math.sqrt(252)
}

export function calmarRatio(returns: number[], prices: number[]) {
  if (prices.length < 2) return 0
  const annReturn = (prices[prices.length - 1] / prices[0]) ** (252 / prices.length) - 1
  const { maxDrawdown: dd } = maxDrawdown(prices)
  return dd === 0 ? 0 : annReturn / Math.abs(dd)
}
