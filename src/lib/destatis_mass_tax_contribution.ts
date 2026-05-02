import type { PapExplorerSettings } from '../components/TaxInput'
import {
  DESTATIS_INCOME_TAX_BRACKETS_2021,
  type DestatisIncomeTaxBracket,
  formatDestatisBracketLabel,
} from './destatis_income_tax_brackets_2021'
import { calculatePapResultFromRE4 } from './pap'
import { actualContributions } from './rates'
import { privilegeLadderPapOpts } from './privilege_benchmark'
import type { PercentileTaxContributionMetric } from './percentile_tax_contribution'

/**
 * Thousand‑EUR aggregates of assessed income‑tax liability that are implicit in Destatis brackets
 * (Σ Einkommen in band × published band-average assessed IT rate — same dimensional algebra Destatis publishes).
 */
export function assessedIncomeTaxMassThousandEur(bracket: DestatisIncomeTaxBracket): number {
  const inc = bracket.adjustedGrossIncomeMassThousandEur
  return inc > 0 ? inc * (bracket.empiricalAssessedIncomeTaxPct / 100) : 0
}

/** Midpoint proxy for “assessment income €” bracket on [lo, hi) — open top uses illustrative span. */
export function midpointAdjustedGrossEurForDestatisBracket(lo: number, hi: number | null): number {
  if (hi === null) {
    /** Open cap 1 M€+: assume representative point above lo for PAP probing only — not inferred from Destatis */
    return lo + 2_250_000
  }
  return (lo + hi) / 2
}

/** Map assessment‑income band midpoint ↔ Arbeitnehmer RE4 crude proxy (same caveat as PrivilegeCheck). */
export function proxyAnnualArbeitnehmerRe4ForDestatisAdjustedGross(midAdjustedGross: number): number {
  const m = Number.isFinite(midAdjustedGross) ? midAdjustedGross : 0
  return Math.max(1, Math.round(Math.max(m, 1)))
}

export type DestatisOfficialAssessedIncomeTaxBandShare = {
  lo: number
  hi: number | null
  label: string
  adjustedGrossIncomeMassThousandEur: number
  assessedIncomeTaxMassThousandEur: number
  shareOfOfficialAssessedIncomeTaxMass: number
}

/**
 * Algebraic reproduction of Destatis aggregates: share of assessed income‑tax **mass sitting in each published band**.
 * Comparable with official Steuer‑tabellen denominators inside that publication year’s universe (not SSO / Vorschuss).
 *
 * Shares sum to exactly 1 (float noise only). **Does not** use PAP.
 */
export function computeDestatisOfficialAssessedIncomeTaxMassShares(options?: {
  brackets?: ReadonlyArray<DestatisIncomeTaxBracket>
}): {
  totalAssessedIncomeTaxMassThousandEur: number
  bands: ReadonlyArray<DestatisOfficialAssessedIncomeTaxBandShare>
} {
  const brackets = options?.brackets ?? DESTATIS_INCOME_TAX_BRACKETS_2021
  const enriched = brackets.map((b) => ({
    bracket: b,
    taxMass: assessedIncomeTaxMassThousandEur(b),
  }))
  const totalAssessedIncomeTaxMassThousandEur = enriched.reduce((s, row) => s + row.taxMass, 0)
  const inv = totalAssessedIncomeTaxMassThousandEur > 0 ? 1 / totalAssessedIncomeTaxMassThousandEur : 0

  const bands: DestatisOfficialAssessedIncomeTaxBandShare[] = enriched.map(({ bracket, taxMass }) => ({
    lo: bracket.lo,
    hi: bracket.hi,
    label: formatDestatisBracketLabel(bracket),
    adjustedGrossIncomeMassThousandEur: bracket.adjustedGrossIncomeMassThousandEur,
    assessedIncomeTaxMassThousandEur: taxMass,
    shareOfOfficialAssessedIncomeTaxMass: taxMass * inv,
  }))
  return { totalAssessedIncomeTaxMassThousandEur, bands }
}

/** Sum `{@link assessedIncomeTaxMassThousandEur}` shares for brackets whose **`lo`** ≥ cutoff (EUR). */
export function officialAssessedIncomeTaxMassShareSumLoMin(
  cutoffLoEurInclusive: number,
  brackets?: ReadonlyArray<DestatisIncomeTaxBracket>,
): number {
  const { bands } = computeDestatisOfficialAssessedIncomeTaxMassShares({ brackets })
  return bands.reduce((s, b) => s + (b.lo >= cutoffLoEurInclusive ? b.shareOfOfficialAssessedIncomeTaxMass : 0), 0)
}

function taxMassForMetric(r: { payrollTax: number; tax: number }, metric: PercentileTaxContributionMetric): number {
  return metric === 'payrollTax' ? r.payrollTax : r.tax + actualContributions(r)
}

export type DestatisMassWeightedPapBandRow = DestatisIncomeTaxBracket & {
  proxyArbeitnehmerGrossEUR: number
  bandMidpointAdjustedGrossEUR: number
  papTaxEUR: number
  weightedAnnualTaxEUR: number
}

/**
 * PAP(**proxy RE4**) at each bracket’s illustrative assessment‑€ midpoint × **adjusted‑gross mass** (dimensionless scaling).
 *
 * Shares are **`Σᵢ PAP(midᵢ)·wᵢ` normalization** — **arb. proportional annual units**, not national € reproduced.
 * Matches “mass table + model earner sweep” heuristic; midpoint + RE4=Einkommen mapping are both crude.
 */
export function computeDestatisAdjustedGrossMassWeightedPapContribution(
  explorer: PapExplorerSettings,
  metric: PercentileTaxContributionMetric,
): {
  totalWeightedTaxEURScaled: number
  bands: ReadonlyArray<
    DestatisMassWeightedPapBandRow & { shareOfTotalWeightedTaxEURScaled: number }
  >
} {
  const opts = privilegeLadderPapOpts(explorer)
  const w = DESTATIS_INCOME_TAX_BRACKETS_2021
  const raw: DestatisMassWeightedPapBandRow[] = w.map((b) => {
    const bandMidpointAdjustedGrossEUR = midpointAdjustedGrossEurForDestatisBracket(b.lo, b.hi)
    const proxyArbeitnehmerGrossEUR = proxyAnnualArbeitnehmerRe4ForDestatisAdjustedGross(bandMidpointAdjustedGrossEUR)
    const r = calculatePapResultFromRE4(proxyArbeitnehmerGrossEUR, opts)
    const papTaxEUR = taxMassForMetric(r, metric)
    const wt = Math.max(0, b.adjustedGrossIncomeMassThousandEur)
    return {
      ...b,
      bandMidpointAdjustedGrossEUR,
      proxyArbeitnehmerGrossEUR,
      papTaxEUR,
      weightedAnnualTaxEUR: papTaxEUR * wt,
    }
  })
  const totalWeightedTaxEURScaled = raw.reduce((s, row) => s + row.weightedAnnualTaxEUR, 0)
  const inv = totalWeightedTaxEURScaled > 0 ? 1 / totalWeightedTaxEURScaled : 0
  return {
    totalWeightedTaxEURScaled,
    bands: raw.map((row) => ({
      ...row,
      shareOfTotalWeightedTaxEURScaled: row.weightedAnnualTaxEUR * inv,
    })),
  }
}
