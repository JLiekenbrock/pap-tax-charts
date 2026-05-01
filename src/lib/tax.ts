export type SeriesPoint = { income: number; tax: number }

// Approximate German income tax curve for single filers (2024 rules simplified)
// This is a simplified progressive function approximating the real law (EStG)
// For accuracy, replace with PAP algorithm details when available.

export function calculateApproxTax(income: number): number {
  const y = Math.max(0, income)
  // Basic exemption (Grundfreibetrag)
  const exempt = 10908
  if (y <= exempt) return 0
  // Helper: compute the raw tax according to the bracket rules (no caps)
  function rawTax(val: number): number {
    if (val <= 58596) {
      const z = (val - exempt) / 10000
      const rate = 0.14 + 0.28 * Math.min(1, z / 4)
      return Math.round((val - exempt) * rate)
    }

    if (val <= 277825) {
      const y0 = 58596
      const progressiveAtY0 = Math.round((y0 - exempt) * (0.14 + 0.28 * Math.min(1, ((y0 - exempt) / 10000) / 4)))
      const b = progressiveAtY0 - Math.round(y0 * 0.42)
      return Math.round(val * 0.42 + b)
    }

    // top bracket continuity
    const y1 = 277825
    const midAtY1 = Math.round(y1 * 0.42 + (Math.round((58596 - exempt) * (0.14 + 0.28 * Math.min(1, ((58596 - exempt) / 10000) / 4))) - Math.round(58596 * 0.42)))
    const bTop = midAtY1 - Math.round(y1 * 0.45)
    return Math.round(val * 0.45 + bTop)
  }

  // Cap: for incomes above 100000 EUR, keep the effective tax rate constant (no further increase)
  const capIncome = 100000
  if (y > capIncome) {
    const taxAtCap = rawTax(capIncome)
    const effectiveRate = taxAtCap / capIncome
    return Math.round(y * effectiveRate)
  }

  // Otherwise return raw tax
  return rawTax(y)
}

// Attempt to dynamically import the PAP implementation. If it's not available,
// fall back to the approximation. We export `calculateTax` and
// `calculateTaxSeries` which delegate to the chosen implementation.

import * as pap from './pap'

// Prefer PAP implementation if available
export const calculateTax = (income: number) => {
  if (pap && typeof pap.calculatePapTax === 'function') return pap.calculatePapTax(income)
  return calculateApproxTax(income)
}

export function calculateTaxSeries(currentIncome: number, points = 40): SeriesPoint[] {
  const max = Math.max(50000, currentIncome * 1.5)
  const step = Math.max(1000, Math.round(max / points))
  const series: SeriesPoint[] = []
    if (pap && typeof pap.calculatePapSeries === 'function') {
      // pap.calculatePapSeries signature is (currentIncome, opts?, points?)
      return pap.calculatePapSeries(currentIncome, undefined, points)
    }
    for (let inc = 0; inc <= max; inc += step) {
      series.push({ income: inc, tax: calculateTax(inc) })
    }
    return series
}
