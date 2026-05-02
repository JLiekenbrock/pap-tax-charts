import type { PapExplorerSettings } from '../components/TaxInput'
import { calculatePapResultFromRE4, type PapCalculationResult } from './pap'
import { actualContributions } from './rates'
import { grossAtDeStatisPercentile, privilegeLadderPapOpts } from './privilege_benchmark'
import { wageDecileFromPrimarySplinePercent } from './tax_distribution_sim'

/** Which annual cash slice is summed per percentile before normalising to shares. */
export type PercentileTaxContributionMetric = 'payrollTax' | 'taxPlusEmployeeSocial'

export type PercentileTaxRankRow = {
  p: number
  grossEUR: number
  taxEUR: number
  /** 0–1; uniform when `totalTaxEUR` is 0 */
  shareOfTotal: number
}

/** Per wage-percentile masses for **p = 1…99** plus row-level shares. */
export type PercentileTaxMassModel = {
  metric: PercentileTaxContributionMetric
  totalTaxEUR: number
  ranks: ReadonlyArray<PercentileTaxRankRow>
}

export type PercentileTaxDecileBucket = {
  decileIndex: number
  /** e.g. "1–10", "91–99" */
  label: string
  sumTaxEUR: number
  /** 0–1; uniform when `totalTaxEUR` is 0 */
  shareOfTotal: number
}

export type PercentileTaxContributionModel = {
  metric: PercentileTaxContributionMetric
  totalTaxEUR: number
  buckets: ReadonlyArray<PercentileTaxDecileBucket>
}

function taxMassForMetric(r: PapCalculationResult, metric: PercentileTaxContributionMetric): number {
  return metric === 'payrollTax' ? r.payrollTax : r.tax + actualContributions(r)
}

function decileLabel(decile1to10: number): string {
  if (decile1to10 === 10) return '91–99'
  const lo = (decile1to10 - 1) * 10 + 1
  const hi = decile1to10 * 10
  return `${lo}–${hi}`
}

/**
 * Core mass model: **p = 1…99**, equal weight per rank — see doc on {@link computePercentileTaxContributionByDecile}.
 */
export function computePercentileTaxContributionByRank(
  explorer: PapExplorerSettings,
  metric: PercentileTaxContributionMetric,
): PercentileTaxMassModel {
  const opts = privilegeLadderPapOpts(explorer)
  const raw: { p: number; grossEUR: number; taxEUR: number }[] = []

  for (let p = 1; p <= 99; p++) {
    const grossEUR = Math.max(1, Math.round(grossAtDeStatisPercentile(p)))
    const r = calculatePapResultFromRE4(grossEUR, opts)
    const taxEUR = taxMassForMetric(r, metric)
    raw.push({ p, grossEUR, taxEUR })
  }

  const totalTaxEUR = raw.reduce((s, row) => s + row.taxEUR, 0)
  const inv = totalTaxEUR > 0 ? 1 / totalTaxEUR : 0
  const ranks: PercentileTaxRankRow[] = raw.map((row) => ({
    ...row,
    shareOfTotal: row.taxEUR * inv,
  }))

  return { metric, totalTaxEUR, ranks }
}

/**
 * **Illustrative model:** For each **full-time wage percentile rank** **p = 1…99** on the 2024
 * Destatis Vollzeit spline, take rounded gross €, evaluate PAP as a **neutral wage earner**
 * (single, STKl I, no children — see {@link privilegeLadderPapOpts}) while keeping your year,
 * insurance path, capital income, and pro overrides. Assign **equal population mass** to each
 * integer percentile, sum the chosen tax slice by **wage decile** (91–99 share the top decile),
 * then report each decile’s **share of the total** across all 99 ranks.
 *
 * This is **not** official Steuerstatistik mass by income band; it is a smooth counterfactual
 * for “if everyone looked like this earner at each FT wage rank, how much of the sum sits where?”.
 */
export function computePercentileTaxContributionByDecile(
  explorer: PapExplorerSettings,
  metric: PercentileTaxContributionMetric,
): PercentileTaxContributionModel {
  const { metric: m, totalTaxEUR, ranks } = computePercentileTaxContributionByRank(explorer, metric)
  const sums = Array.from({ length: 10 }, () => 0)

  for (const row of ranks) {
    const d = wageDecileFromPrimarySplinePercent(row.p)
    sums[d - 1] += row.taxEUR
  }

  const inv = totalTaxEUR > 0 ? 1 / totalTaxEUR : 0

  const buckets: PercentileTaxDecileBucket[] = sums.map((sumTaxEUR, i) => {
    const decileIndex = i + 1
    return {
      decileIndex,
      label: decileLabel(decileIndex),
      sumTaxEUR,
      shareOfTotal: sumTaxEUR * inv,
    }
  })

  return { metric: m, totalTaxEUR, buckets }
}
