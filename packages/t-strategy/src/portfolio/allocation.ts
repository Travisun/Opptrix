/** Asset allocation models */

export function meanVarianceWeights(
  expectedReturns: number[],
  covMatrix: number[][],
  riskAversion = 2.0,
): number[] {
  const n = expectedReturns.length
  if (n === 0 || covMatrix.length !== n) return []

  // Invert covariance via Gauss-Jordan (small n only)
  const inv = invertMatrix(covMatrix)
  if (!inv) return equalWeights(n)

  const raw = inv.map((row, i) =>
    row.reduce((sum, v, j) => sum + v * expectedReturns[j], 0) / riskAversion,
  )
  const total = raw.reduce((a, b) => a + b, 0)
  if (total === 0) return equalWeights(n)
  return raw.map(w => w / total)
}

function equalWeights(n: number) {
  return Array.from({ length: n }, () => 1 / n)
}

function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length
  const aug = m.map((row, i) => {
    const ident = Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
    return [...row, ...ident]
  })

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) return null
    if (pivot !== col) [aug[col], aug[pivot]] = [aug[pivot], aug[col]]

    const div = aug[col][col]
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= div

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = aug[row][col]
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j]
    }
  }

  return aug.map(row => row.slice(n))
}

export function riskParityWeights(covDiag: number[]) {
  const invVol = covDiag.map(v => (v > 0 ? 1 / Math.sqrt(v) : 0))
  const sum = invVol.reduce((a, b) => a + b, 0)
  return sum === 0 ? invVol : invVol.map(v => v / sum)
}

export function kellyFraction(winRate: number, avgWin: number, avgLoss: number) {
  if (avgLoss === 0) return 0
  const b = avgWin / avgLoss
  const q = 1 - winRate
  const f = (b * winRate - q) / b
  return Math.max(0, Math.min(1, f))
}

export function halfKelly(winRate: number, avgWin: number, avgLoss: number) {
  return kellyFraction(winRate, avgWin, avgLoss) * 0.5
}

export function maxDrawdownLimit(totalRisk: number, maxDd = 0.15) {
  if (totalRisk <= 0) return 0
  return Math.min(1, maxDd / totalRisk)
}
