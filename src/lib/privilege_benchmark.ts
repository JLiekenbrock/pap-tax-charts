import { PapCalculationResult, PapOptions, calculatePapResultFromRE4 } from './pap'
import { actualContributions } from './rates'
import {
  destatisIncomeTaxBracketForApproxEinkommen,
  formatDestatisBracketLabel,
} from './destatis_income_tax_brackets_2021'
import type { PapExplorerSettings } from '../components/TaxInput'

/**
 * Destatis Verdiensterhebung 2024: Bruttojahresverdienst inkl. Sonderzahlungen,
 * Vollzeitbeschäftigte (Anteil mit diesem Verdienst oder weniger).
 * Quelle: Statistisches Bundesamt, Pressemitteilung Nr. 134 vom 10. April 2025.
 */
const DESTATIS_FT_GROSS_ANNUAL_2024: ReadonlyArray<{ p: number; eur: number }> = [
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

export const PRIVILEGE_INCOME_SOURCE_LABEL =
  'Destatis Verdiensterhebung 2024 (Vollzeit, inkl. Sonderzahlungen)'

/** Not serious accounting — just clearer copy than bare enums in the UI. */
export type TaxOutcomeBand = 'winner' | 'typical' | 'loser'

export function individualBenchmarkGross(settings: PapExplorerSettings): number {
  if (settings.filing !== 'married') {
    return Math.max(0, settings.income)
  }
  const a = Math.max(0, settings.income1)
  const b = Math.max(0, settings.income2)
  if (a > 0 && b > 0) return (a + b) / 2
  return Math.max(a, b)
}

/** Total RE4 used like a joint “Einkommen” proxy for bracket placement (married = sum). */
export function householdGrossForDestatisBracket(settings: PapExplorerSettings): number {
  if (settings.filing === 'married') {
    return Math.max(0, settings.income1) + Math.max(0, settings.income2)
  }
  return Math.max(0, settings.income)
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
  band: TaxOutcomeBand
  benchmarkGrossIndividual: number
  incomePercentile: number
  /** Modeled payroll income tax (incl. Soli/church on wages) / salary RE4. */
  yourPayrollIncomeTaxPct: number
  /** For context: tax + employee social on wage-only slice. */
  yourWageBurdenPct: number
  /** Destatis “adjusted gross income” band label (2021 table); gross used as placement proxy. */
  destatisBracketLabel: string | null
  /** Σ assessed income tax / Σ Einkommen in that Destatis band, 2021. */
  bracketPeerAssessedIncomeTaxPct: number | null
  /** EUR used to pick the bracket (single: RE4; married: sum RE4). */
  bracketPlacementBasisEur: number
  destatisIncomeTaxTableYear: number
  yourBurdenPctAllIn: number
  hasCapitalIncome: boolean
  marriedHouseholdNote: boolean
}

/**
 * Winner/loser: modeled **payroll income tax % on salary** vs Destatis aggregate
 * **assessed income tax / Einkommen** for the band your gross is mapped into.
 * Social contributions are **not** in the official bracket ratio — see UI.
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
  const yourWageBurdenPct = totalBurdenPercentOnIncome(yourWage)

  const bracketPlacementBasisEur = householdGrossForDestatisBracket(settings)
  const bracketRow = destatisIncomeTaxBracketForApproxEinkommen(bracketPlacementBasisEur)
  const bracketPeerAssessedIncomeTaxPct = bracketRow?.empiricalAssessedIncomeTaxPct ?? null
  const destatisBracketLabel = bracketRow ? formatDestatisBracketLabel(bracketRow) : null

  const hasCapitalIncome = (settings.investmentIncome || 0) > 0
  const yourBurdenPctAllIn = hasCapitalIncome ? totalBurdenPercentOnIncome(userResult) : yourWageBurdenPct

  const band =
    bracketPeerAssessedIncomeTaxPct !== null
      ? taxOutcomeBandFromBurdens(yourPayrollIncomeTaxPct, bracketPeerAssessedIncomeTaxPct)
      : 'typical'

  return {
    band,
    benchmarkGrossIndividual,
    incomePercentile: individualIncomePercentileDeStatis(benchmarkGrossIndividual),
    yourPayrollIncomeTaxPct,
    yourWageBurdenPct,
    destatisBracketLabel,
    bracketPeerAssessedIncomeTaxPct,
    bracketPlacementBasisEur,
    destatisIncomeTaxTableYear: 2021,
    yourBurdenPctAllIn,
    hasCapitalIncome,
    marriedHouseholdNote: settings.filing === 'married',
  }
}
