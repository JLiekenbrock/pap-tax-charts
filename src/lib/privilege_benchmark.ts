import {
  PapCalculationResult,
  PapOptions,
  calculatePapForMarriedHouseholdTotal,
  calculatePapResultFromRE4,
} from './pap'
import { actualContributions } from './rates'
import {
  DESTATIS_INCOME_TAX_BRACKETS_2021,
  type DestatisIncomeTaxBracket,
  destatisIncomeTaxBracketForApproxEinkommen,
  destatisMassWeightedAssessedIncomeTaxOnlyPct as destatisTableMassWeightedIncomeTaxOnlyPct,
  formatDestatisBracketLabel,
} from './destatis_income_tax_brackets_2021'
import type { PapExplorerSettings } from '../components/TaxInput'
import { explorerNominalWageEUR } from './explorer_real_income'

/** Publication cohort for embedded Destatis Σ‑Einkommen / Σ‑assessed‑income aggregates. */
export const DESTATIS_INCOME_TABLE_PUBLICATION_YEAR = 2021

/** Tariff baseline for normalized Destatis income-tax uplift (embedded table cohort year). */
const NEUTRAL_UP_LIFT_BASELINE_YEAR = 2021 as const

/** PAP tariff years supported for ladder rescaling alongside {@link NEUTRAL_UP_LIFT_BASELINE_YEAR}. */
export type NeutralLadderTariffYear = typeof NEUTRAL_UP_LIFT_BASELINE_YEAR | 2025 | 2026

function anchorTariffYearForDestatisUplift(year: number): NeutralLadderTariffYear {
  if (!Number.isFinite(year)) return 2026
  if (year <= NEUTRAL_UP_LIFT_BASELINE_YEAR) return NEUTRAL_UP_LIFT_BASELINE_YEAR
  if (year <= 2025) return 2025
  return 2026
}

/**
 * Lift embedded Destatis **assessed-income-tax / Σ‑Einkommen** aggregates from the publication cohort (**2021**)
 * toward the explorer-selected PAP tariff, using a neutral reference earner (single, STKL I; same ladder anchors as charts):
 *
 * `multiplier ≈ clamp( (`mass‑weighted payroll tax ÷ gross` at anchor tariff ) ÷ (`…` at **PAP 2021**), capped )`.
 *
 * Intermediate calendar years (**2022–2024**) are **not** modelled → **2025** is used as the uplift anchor whenever
 * {@link PapExplorerSettings.year} sits in `(2022, 2025]`.
 *
 * Applies only to embedded Destatis percentage columns — never scales full PAP model outputs (those already use `explorer.year`).
 */
export function neutralLadderStaleDestatisIncomeTaxMultiplier(settings: PapExplorerSettings): {
  multiplier: number
  /** Payroll-tax share ratio `pct(anchor year) / pct(2021)` before global multiplier clamp — not a geometric “one-year step”. */
  rAnnual: number
  /** Informational tariff-year span `anchor year − publication baseline` — not used inside the multiplication anymore. */
  yearsExponent: number
  anchorTariffYear: NeutralLadderTariffYear
  neutralMassPct2021: number
  neutralMassPctAnchor: number
} {
  const anchorTariffYear = anchorTariffYearForDestatisUplift(settings.year)
  const pct2021 = massWeightedNeutralPayrollIncomeTaxPct(settings, NEUTRAL_UP_LIFT_BASELINE_YEAR)
  const pctAnchor = massWeightedNeutralPayrollIncomeTaxPct(settings, anchorTariffYear)
  const yearsExponent = Math.max(0, anchorTariffYear - NEUTRAL_UP_LIFT_BASELINE_YEAR)
  const rawR = pct2021 > 1e-9 ? pctAnchor / pct2021 : 1
  const rAnnual = Number.isFinite(rawR) ? rawR : 1
  const multiplier = Math.min(1.6, Math.max(1, rAnnual))
  return {
    multiplier,
    rAnnual,
    yearsExponent,
    anchorTariffYear,
    neutralMassPct2021: pct2021,
    neutralMassPctAnchor: pctAnchor,
  }
}

/** Mass‑weighted Σ `payrollTax / salary` across Destatis Σ‑Einkommen weights — neutral ladder earner, given tariff year only. */
export function massWeightedNeutralPayrollIncomeTaxPct(
  settings: PapExplorerSettings,
  tariffYear: NeutralLadderTariffYear,
): number {
  const explorer = canonicalWageExplorerForPrivilegeLadder(settings)
  const ladderOpts = { ...papOptsFromExplorer(explorer, { investmentIncome: 0 }), year: tariffYear }
  let sumW = 0
  let sumWP = 0
  for (const b of DESTATIS_INCOME_TAX_BRACKETS_2021) {
    const { evaluationGrossEur } = ladderEvaluationGrossForDestatisBracket(b)
    const r = calculatePapResultFromRE4(evaluationGrossEur, ladderOpts)
    const w = b.adjustedGrossIncomeMassThousandEur
    const p = payrollIncomeTaxPercentOnSalary(r)
    if (w > 0 && Number.isFinite(p)) {
      sumW += w
      sumWP += w * p
    }
  }
  return sumW > 0 ? sumWP / sumW : 0
}

/**
 * - intra: payroll income tax vs Destatis peers in-band
 * - wageSocialBurden: payroll tax + employee social vs mass-weighted anchors across bands
 */
export type PrivilegeComparisonMode = 'intra' | 'wageSocialBurden'

export type CrossBandLadderRow = {
  bracketLabel: string
  /** Rounded midpoint of the Destatis band (before floor) — lies inside the bracket span. */
  nominalMidpointEur: number
  /** RE4 passed to PAP (≥ {@link MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR} when midpoint is lower). */
  anchorGross: number
  socialPct: number
  /**
   * (Total model tax + employee social) / total income at anchor.
   * With no capital income: equals payroll+social as % of salary.
   * With capital: includes Abgeltungsteuer etc.; denominator is anchor gross + investment.
   */
  wageBurdenPct: number
  massThousandEur: number
  isYourBracket: boolean
  /** True when bracket midpoint &lt; floor; model evaluated at {@link MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR} instead. */
  usedMinimumEvaluationFloor: boolean
}

/** @deprecated Use CrossBandLadderRow; kept as alias for tests / callers. */
export type SocialLadderRow = CrossBandLadderRow

/**
 * Bracket midpoints below this annual gross are not meaningful for statutory SV in our PAP-style model
 * (contribution share can exceed 100% of tiny gross). Evaluations use this floor instead.
 */
export const MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR = 12_000

/**
 * Destatis Verdiensterhebung 2024: Bruttojahresverdienst inkl. Sonderzahlungen,
 * Vollzeitbeschäftigte (Anteil mit diesem Verdienst oder weniger).
 * Quelle: Statistisches Bundesamt, Pressemitteilung Nr. 134 vom 10. April 2025.
 */
export const DESTATIS_FULLTIME_WAGE_PERCENTILES_2024: ReadonlyArray<{ readonly p: number; readonly eur: number }> = [
  { p: 10, eur: 32_526 },
  { p: 20, eur: 37_944 },
  { p: 30, eur: 42_700 },
  { p: 40, eur: 47_244 },
  { p: 50, eur: 52_159 },
  { p: 60, eur: 58_214 },
  { p: 70, eur: 65_843 },
  { p: 80, eur: 77_105 },
  { p: 90, eur: 97_680 },
  { p: 99, eur: 213_286 },
]

/**
 * Highest **published** nominal gross in the Destatis 2024 full-time percentile table (**p = 99** entry).
 *
 * Important: Destatis publishes deciles plus **p99 only** — there is **no official “p100” wage** in this table.
 * The chart deliberately extends the EUR axis beyond this value where needed so tariff features above the empirical
 * wage tail remain visible ({@link findMinGrossPositiveReichen}).
 */
export const DESTATIS_FULLTIME_WAGE_P99_MAX_EUR_2024 =
  DESTATIS_FULLTIME_WAGE_PERCENTILES_2024[DESTATIS_FULLTIME_WAGE_PERCENTILES_2024.length - 1]!.eur

/**
 * @deprecated Use {@link DESTATIS_FULLTIME_WAGE_P99_MAX_EUR_2024}; this alias was mislabelled (“p100”) — Destatis publishes p99 max only.
 */
export const DESTATIS_FULLTIME_WAGE_P100_CHART_MAX_EUR_2024 = DESTATIS_FULLTIME_WAGE_P99_MAX_EUR_2024

/**
 * Chart rug positions: **only** percentiles Destatis actually publishes — p10 … p90 (deciles),
 * plus p99. No interpolated p91–p98 rugs (those EUR levels are not tabulated official points).
 *
 * Splines elsewhere ({@link individualIncomePercentileDeStatis}, {@link grossAtDeStatisPercentile}) still interpolate
 * between these knots for axes and percentile mapping.
 */
export const DESTATIS_CHART_INCOME_RUG_MARKERS_2024: ReadonlyArray<{ readonly p: number; readonly eur: number }> =
  DESTATIS_FULLTIME_WAGE_PERCENTILES_2024

const DESTATIS_FT_GROSS_ANNUAL_2024 = DESTATIS_FULLTIME_WAGE_PERCENTILES_2024

export const PRIVILEGE_INCOME_SOURCE_LABEL =
  'Destatis Verdiensterhebung 2024 (Vollzeit, inkl. Sonderzahlungen)'

/** Not serious accounting — just clearer copy than bare enums in the UI. */
export type TaxOutcomeBand = 'winner' | 'typical' | 'loser'

export function individualBenchmarkGross(settings: PapExplorerSettings): number {
  const y = settings.year
  if (settings.filing !== 'married') {
    return Math.max(0, explorerNominalWageEUR(settings.income, y, settings))
  }
  const a = Math.max(0, explorerNominalWageEUR(settings.income1, y, settings))
  const b = Math.max(0, explorerNominalWageEUR(settings.income2, y, settings))
  if (a > 0 && b > 0) return (a + b) / 2
  return Math.max(a, b)
}

/** Total RE4 used like a joint “Einkommen” proxy for bracket placement (married = sum). */
export function householdGrossForDestatisBracket(settings: PapExplorerSettings): number {
  const y = settings.year
  if (settings.filing === 'married') {
    return (
      explorerNominalWageEUR(Math.max(0, settings.income1), y, settings) +
      explorerNominalWageEUR(Math.max(0, settings.income2), y, settings)
    )
  }
  return Math.max(0, explorerNominalWageEUR(settings.income, y, settings))
}

/**
 * Explorer slice used only for cross-band ladder anchors: neutral wage earner
 * (single, STKL I, no children) so mass-weighted benchmarks do not move with
 * splitting or family allowances — mirroring how the intra-band Destatis peer %
 * is an official aggregate, not re-simulated under your STKL.
 *
 * Preserves year, Soli/church, KVZ/PKV path, capital income, pro BBG overrides,
 * and contribution flags (e.g. Beamte) from the user.
 */
export function canonicalWageExplorerForPrivilegeLadder(
  explorer: PapExplorerSettings,
): PapExplorerSettings {
  return {
    ...explorer,
    filing: 'single',
    stkl: 1,
    children: 0,
  }
}

function papOptsFromExplorer(explorer: PapExplorerSettings, overrides?: Partial<PapOptions>): PapOptions {
  const base: PapOptions = {
    year: explorer.year,
    filing: explorer.filing,
    children: explorer.children,
    stkl: explorer.stkl,
    solidarity: explorer.solidarity,
    churchRate: explorer.churchRate,
    kvz: explorer.kvz,
    pvs: explorer.pvs,
    pvz: explorer.pvz,
    pva: explorer.pva,
    krv: explorer.krv,
    alv: explorer.alv,
    pkv: explorer.pkv,
    pkpv: explorer.pkpv,
    pkpvagz: explorer.pkpvagz,
    investmentIncome: explorer.investmentIncome,
  }
  if (explorer.proMode) {
    if (explorer.bbgKvPv !== undefined) base.bbgKvPv = explorer.bbgKvPv
    if (explorer.bbgRvAlv !== undefined) base.bbgRvAlv = explorer.bbgRvAlv
    if (explorer.jaeg !== undefined) base.jaeg = explorer.jaeg
  }
  return { ...base, ...overrides }
}

/** Pap options for cross-band ladder anchors (canonical earner profile). */
export function privilegeLadderPapOpts(
  explorer: PapExplorerSettings,
  overrides?: Partial<PapOptions>,
): PapOptions {
  return papOptsFromExplorer(canonicalWageExplorerForPrivilegeLadder(explorer), overrides)
}

export function grossAtDeStatisPercentile(percent: number): number {
  const pts = DESTATIS_FT_GROSS_ANNUAL_2024
  const p = Math.min(100, Math.max(0, percent))
  if (p <= 0) return 0
  if (p <= 10) {
    return (p / 10) * pts[0].eur
  }
  if (p >= 99) {
    const slope = (pts[pts.length - 1].eur - pts[pts.length - 2].eur) / (99 - 90)
    return pts[pts.length - 1].eur + (p - 99) * slope
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (p <= b.p) {
      const t = (p - a.p) / (b.p - a.p)
      return a.eur + t * (b.eur - a.eur)
    }
  }
  return pts[pts.length - 1].eur
}

export function individualIncomePercentileDeStatis(grossAnnual: number): number {
  const pts = DESTATIS_FT_GROSS_ANNUAL_2024
  const g = grossAnnual
  if (!(g > 0)) return 0
  if (g <= pts[0].eur) {
    return Math.min(10, (g / pts[0].eur) * 10)
  }
  if (g >= pts[pts.length - 1].eur) {
    const slope = (pts[pts.length - 1].eur - pts[pts.length - 2].eur) / (99 - 90)
    if (slope <= 0) return 99
    return Math.min(99.95, 99 + (g - pts[pts.length - 1].eur) / slope)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (g <= b.eur) {
      const t = (g - a.eur) / (b.eur - a.eur)
      return a.p + t * (b.p - a.p)
    }
  }
  return 99
}

/** Payroll taxes on wages only (Lohnsteuer inkl. Soli/KiSt) as % of gross salary RE4. */
export function payrollIncomeTaxPercentOnSalary(result: PapCalculationResult): number {
  if (result.income <= 0) return 0
  return (result.payrollTax / result.income) * 100
}

/** Midrank position (0–100): (# below + ½ × # equal) / n × 100. */
function percentileRankAmongSamples(samples: readonly number[], value: number): number {
  const n = samples.length
  if (n === 0) return 50
  const eps = 1e-9
  let less = 0
  let equal = 0
  for (const s of samples) {
    if (s < value - eps) less++
    else if (Math.abs(s - value) < eps) equal++
  }
  return ((less + 0.5 * equal) / n) * 100
}

/**
 * Ranks **your** payroll income tax ÷ salary against the **same ratio** modeled at gross levels
 * `grossAtDeStatisPercentile(1)…grossAtDeStatisPercentile(99)`, with **your** PAP slice (year, filing,
 * STKL, insurance path, Kinder, capital income, …). Uses the FT wage percentile spline —
 * Destatis publishes spot percentiles only; intermediate grosses interpolate like income rank.
 *
 * Higher = your payroll withholding intensity is heavier than more of those reference grosses under
 * this scenario (not administrative microdata percentiles).
 */
export function payrollTaxPctPercentileVersusDestatisWageSpline(
  settings: PapExplorerSettings,
  userResult: PapCalculationResult,
): number | null {
  if (userResult.income <= 0) return null
  const opts = papOptsFromExplorer(settings)
  const samples: number[] = []
  for (let p = 1; p <= 99; p++) {
    const g = Math.max(1, Math.round(grossAtDeStatisPercentile(p)))
    const r =
      settings.filing === 'married'
        ? calculatePapForMarriedHouseholdTotal(g, settings.income1, settings.income2, opts)
        : calculatePapResultFromRE4(g, opts)
    samples.push(payrollIncomeTaxPercentOnSalary(r))
  }
  return percentileRankAmongSamples(samples, payrollIncomeTaxPercentOnSalary(userResult))
}

/** Employee RV + health/care + AV cash shares as % of gross salary RE4 (`actualContributions`). */
export function employeeSocialPercentOnSalary(result: PapCalculationResult): number {
  if (result.income <= 0) return 0
  return (actualContributions(result) / result.income) * 100
}

/**
 * Gross RE4 proxy at which we evaluate the wage model per Destatis Einkommen band —
 * midpoint of closed bands; open top band uses a high anchor so caps dominate.
 */
export function representativeGrossForDestatisBracket(b: DestatisIncomeTaxBracket): number {
  if (b.hi === null) {
    return Math.max(b.lo + 250_000, Math.round(b.lo * 1.2))
  }
  return (b.lo + b.hi) / 2
}

/** Nominal bracket midpoint and gross actually passed to the model (may be floored). */
export function ladderEvaluationGrossForDestatisBracket(b: DestatisIncomeTaxBracket): {
  nominalMidpointEur: number
  evaluationGrossEur: number
  usedMinimumEvaluationFloor: boolean
} {
  const nominalMidpointEur = representativeGrossForDestatisBracket(b)
  const roundedNominal = Math.round(nominalMidpointEur)
  const evaluationGrossEur = Math.max(roundedNominal, MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR)
  return {
    nominalMidpointEur,
    evaluationGrossEur,
    usedMinimumEvaluationFloor: evaluationGrossEur > roundedNominal,
  }
}

function modelResultAtAnchorGross(gross: number, settings: PapExplorerSettings): PapCalculationResult {
  const g = Math.max(0, Math.round(gross))
  return calculatePapResultFromRE4(g, papOptsFromExplorer(settings))
}

/** Payroll tax + employee social as % of gross (wage slice). */
export function wageBurdenPercentOnSalary(result: PapCalculationResult): number {
  if (result.income <= 0) return 0
  const social = actualContributions(result)
  return ((result.payrollTax + social) / result.income) * 100
}

/**
 * Per-band anchors: social % on salary, and total tax+social % on model total income
 * (wage + your entered investment income at every anchor).
 */
export function crossBandModelLadder(
  settings: PapExplorerSettings,
): {
  weightedSocialRefPct: number
  weightedWageBurdenRefPct: number
  rows: ReadonlyArray<CrossBandLadderRow>
} {
  const ladderExplorer = canonicalWageExplorerForPrivilegeLadder(settings)
  const bracketRow = destatisIncomeTaxBracketForApproxEinkommen(
    householdGrossForDestatisBracket(settings),
  )
  let sumW = 0
  let sumWs = 0
  let sumWb = 0
  const rows: CrossBandLadderRow[] = []

  for (const b of DESTATIS_INCOME_TAX_BRACKETS_2021) {
    const { evaluationGrossEur, usedMinimumEvaluationFloor, nominalMidpointEur } =
      ladderEvaluationGrossForDestatisBracket(b)
    const r = modelResultAtAnchorGross(evaluationGrossEur, ladderExplorer)
    const socialPct = employeeSocialPercentOnSalary(r)
    const wageBurdenPct = totalBurdenPercentOnIncome(r)
    const w = b.adjustedGrossIncomeMassThousandEur
    if (w > 0 && Number.isFinite(socialPct) && Number.isFinite(wageBurdenPct)) {
      sumW += w
      sumWs += w * socialPct
      sumWb += w * wageBurdenPct
    }
    const isSame =
      bracketRow !== null &&
      b.lo === bracketRow.lo &&
      (b.hi === bracketRow.hi || (b.hi === null && bracketRow.hi === null))
    rows.push({
      bracketLabel: formatDestatisBracketLabel(b),
      nominalMidpointEur: Math.round(nominalMidpointEur),
      anchorGross: evaluationGrossEur,
      socialPct,
      wageBurdenPct,
      massThousandEur: w,
      isYourBracket: isSame,
      usedMinimumEvaluationFloor,
    })
  }

  const weightedSocialRefPct = sumW > 0 ? sumWs / sumW : 0
  const weightedWageBurdenRefPct = sumW > 0 ? sumWb / sumW : 0
  return { weightedSocialRefPct, weightedWageBurdenRefPct, rows }
}

/** @deprecated Prefer crossBandModelLadder (also returns wage burden and one row shape). */
export function crossBandWeightedEmployeeSocialRef(settings: PapExplorerSettings): {
  weightedRefPct: number
  rows: ReadonlyArray<CrossBandLadderRow>
} {
  const { weightedSocialRefPct, rows } = crossBandModelLadder(settings)
  return { weightedRefPct: weightedSocialRefPct, rows }
}

/** Payroll `tax` + `actualContributions` (RV, KV+PV or net PKV, AV) as % of `totalIncome`. */
export function totalBurdenPercentOnIncome(result: PapCalculationResult): number {
  const social = actualContributions(result)
  const denom = result.totalIncome
  if (denom <= 0) return 0
  return ((result.tax + social) / denom) * 100
}

const DEFAULT_TOL = 1.5

export function taxOutcomeBandFromBurdens(
  userBurdenPct: number,
  referenceBurdenPct: number,
  tolerancePctPoints = DEFAULT_TOL,
): TaxOutcomeBand {
  if (userBurdenPct < referenceBurdenPct - tolerancePctPoints) return 'winner'
  if (userBurdenPct > referenceBurdenPct + tolerancePctPoints) return 'loser'
  return 'typical'
}

export type PrivilegeSnapshot = {
  /** Assessed income-tax intensity vs band aggregate (intra mode). */
  bandIntra: TaxOutcomeBand
  /** Employee social % vs income-mass-weighted ref across bands (`across` mode). */
  bandAcross: TaxOutcomeBand
  /** Payroll tax + employee social vs mass-weighted ref (wage + social burden tab). */
  bandAcrossFull: TaxOutcomeBand
  benchmarkGrossIndividual: number
  incomePercentile: number
  /**
   * Where your payroll-tax ÷ salary sits among the same ratios at spline gross `p=1…99`
   * (same settings); null without salary.
   */
  payrollTaxPctPercentileVersusFtWageSpline: number | null
  /** Modeled payroll income tax (incl. Soli/church on wages) / salary RE4. */
  yourPayrollIncomeTaxPct: number
  /** Modeled employee RV + KV/PV + AV / salary RE4 (wage-only slice). */
  yourEmployeeSocialPct: number
  /** Payroll tax + employee social as % of salary (wage-only scenario). */
  yourWageBurdenPct: number
  /** (Total model tax + employee social) / total income — cross-band tab headline & vs ref. */
  yourTotalBurdenPct: number
  /** Destatis “adjusted gross income” band label (2021 table); gross used as placement proxy. */
  destatisBracketLabel: string | null
  /** Σ assessed income tax / Σ Einkommen in that Destatis band (publication cohort). */
  bracketPeerAssessedIncomeTaxPct: number | null
  /** Empirical band peer % uplifted toward modeled tariff cohort (neutral-ladder heuristic; see snapshot fields `stale*`.) */
  bracketPeerAssessedIncomeTaxPctTariffAdjusted: number | null
  /**
   * Typical employee-social % if everyone sat at their bracket's anchor gross,
   * weighted by Destatis Σ Einkommen mass in each band (model schedule only).
   */
  crossBandWeightedSocialRefPct: number | null
  /**
   * Mass-weighted average (total tax + employee social) / total model income at anchors
   * — includes your capital-income assumptions at each wage anchor.
   * **PAP simulation only**; Destatis supplies Σ Einkommen **weights**, not measured SV.
   */
  crossBandWeightedWageBurdenRefPct: number | null
  /**
   * National assessed income tax / Einkommen implied by the embedded table (mass-weighted across bands).
   * **No social data** in this publication — for context vs your all-in model burden only.
   */
  destatisMassWeightedAssessedIncomeTaxOnlyPct: number
  /** Same aggregate × tariff-age heuristic {@link staleDestatisIncomeTaxMultiplierApprox}. */
  destatisMassWeightedAssessedIncomeTaxOnlyPctTariffAdjusted: number
  socialLadderRows: ReadonlyArray<CrossBandLadderRow>
  /** EUR used to pick the bracket (single: RE4; married: sum RE4). */
  bracketPlacementBasisEur: number
  destatisIncomeTaxTableYear: number
  /**
   * Multiplier applied only to embedded Destatis **empirical** income-tax / Einkommen shares —
   * neutral ladder `payroll tax ÷ gross` at **{@link staleDestatisIncomeTaxAnchorTariffYear} vs PAP 2021**.
   */
  staleDestatisIncomeTaxMultiplierApprox: number
  /** Payroll-tax share ratio at anchor tariff vs Baseline **2021** (numerator / denominator from {@link neutralLadderStaleDestatisIncomeTaxMultiplier}). */
  staleDestatisIncomeTaxUpliftRAnnual: number
  /** Informational `anchor year − 2021` tariff span — no longer participates in multiplying the heuristic. */
  staleDestatisIncomeTaxExponentYears: number
  staleDestatisIncomeTaxAnchorTariffYear: number
  yourBurdenPctAllIn: number
  hasCapitalIncome: boolean
  marriedHouseholdNote: boolean
}

/**
 * Snapshot for PrivilegeCheck:
 * - **Within band:** payroll income tax % vs Destatis assessed income tax / Einkommen for that slice.
 * - **Wage + social burden:** your PAP **tax + employee social** vs a **PAP-only** ladder average
 *   (same anchor grosses), using Destatis **Σ Einkommen only as weights** — not a Destatis-measured combined rate.
 *   Anchors use a **fixed reference earner** (single, STKL I, no children) so the benchmark does not slide with
 *   splitting or family STKL; your headline still reflects your actual inputs.
 *   The tax table has **no** employee SV; the UI still shows mass-weighted **income-tax-only** for context.
 */
export function computePrivilegeSnapshot(
  settings: PapExplorerSettings,
  userResult: PapCalculationResult,
): PrivilegeSnapshot {
  const benchmarkGrossIndividual = individualBenchmarkGross(settings)
  const optsWageOnly = papOptsFromExplorer(settings, { investmentIncome: 0 })
  const salaryRe4 = userResult.income
  const yourWage = calculatePapResultFromRE4(salaryRe4, optsWageOnly)
  const yourPayrollIncomeTaxPct = payrollIncomeTaxPercentOnSalary(userResult)
  const yourWageBurdenPct = wageBurdenPercentOnSalary(yourWage)

  const bracketPlacementBasisEur = householdGrossForDestatisBracket(settings)
  const bracketRow = destatisIncomeTaxBracketForApproxEinkommen(bracketPlacementBasisEur)
  const bracketPeerAssessedIncomeTaxPct = bracketRow?.empiricalAssessedIncomeTaxPct ?? null
  const stale = neutralLadderStaleDestatisIncomeTaxMultiplier(settings)
  const bracketPeerAssessedIncomeTaxPctTariffAdjusted =
    bracketPeerAssessedIncomeTaxPct !== null ? bracketPeerAssessedIncomeTaxPct * stale.multiplier : null

  const destatisBracketLabel = bracketRow ? formatDestatisBracketLabel(bracketRow) : null

  const hasCapitalIncome = (settings.investmentIncome || 0) > 0
  const yourTotalBurdenPct = totalBurdenPercentOnIncome(userResult)
  const yourBurdenPctAllIn = yourTotalBurdenPct
  const yourEmployeeSocialPct = employeeSocialPercentOnSalary(yourWage)

  const {
    weightedSocialRefPct,
    weightedWageBurdenRefPct,
    rows: socialLadderRows,
  } = crossBandModelLadder(settings)
  const crossBandWeightedSocialRefPct = socialLadderRows.length > 0 ? weightedSocialRefPct : null
  const crossBandWeightedWageBurdenRefPct = socialLadderRows.length > 0 ? weightedWageBurdenRefPct : null
  const destatisMassWeightedAssessedIncomeTaxOnlyPct = destatisTableMassWeightedIncomeTaxOnlyPct()
  const destatisMassWeightedAssessedIncomeTaxOnlyPctTariffAdjusted =
    destatisMassWeightedAssessedIncomeTaxOnlyPct * stale.multiplier

  const bandIntra =
    bracketPeerAssessedIncomeTaxPctTariffAdjusted !== null
      ? taxOutcomeBandFromBurdens(yourPayrollIncomeTaxPct, bracketPeerAssessedIncomeTaxPctTariffAdjusted)
      : 'typical'

  const bandAcross =
    crossBandWeightedSocialRefPct !== null && salaryRe4 > 0
      ? taxOutcomeBandFromBurdens(yourEmployeeSocialPct, crossBandWeightedSocialRefPct)
      : 'typical'

  const bandAcrossFull =
    crossBandWeightedWageBurdenRefPct !== null && userResult.totalIncome > 0
      ? taxOutcomeBandFromBurdens(yourTotalBurdenPct, crossBandWeightedWageBurdenRefPct)
      : 'typical'

  const payrollTaxPctPercentileVersusFtWageSpline =
    payrollTaxPctPercentileVersusDestatisWageSpline(settings, userResult)

  return {
    bandIntra,
    bandAcross,
    bandAcrossFull,
    benchmarkGrossIndividual,
    incomePercentile: individualIncomePercentileDeStatis(benchmarkGrossIndividual),
    payrollTaxPctPercentileVersusFtWageSpline,
    yourPayrollIncomeTaxPct,
    yourEmployeeSocialPct,
    yourWageBurdenPct,
    yourTotalBurdenPct,
    destatisBracketLabel,
    bracketPeerAssessedIncomeTaxPct,
    bracketPeerAssessedIncomeTaxPctTariffAdjusted,
    crossBandWeightedSocialRefPct,
    crossBandWeightedWageBurdenRefPct,
    destatisMassWeightedAssessedIncomeTaxOnlyPct,
    destatisMassWeightedAssessedIncomeTaxOnlyPctTariffAdjusted,
    socialLadderRows,
    bracketPlacementBasisEur,
    destatisIncomeTaxTableYear: DESTATIS_INCOME_TABLE_PUBLICATION_YEAR,
    staleDestatisIncomeTaxMultiplierApprox: stale.multiplier,
    staleDestatisIncomeTaxUpliftRAnnual: stale.rAnnual,
    staleDestatisIncomeTaxExponentYears: stale.yearsExponent,
    staleDestatisIncomeTaxAnchorTariffYear: stale.anchorTariffYear,
    yourBurdenPctAllIn,
    hasCapitalIncome,
    marriedHouseholdNote: settings.filing === 'married',
  }
}
