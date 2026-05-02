import { PapCalculationResult, PapOptions, calculatePapForMarriedHouseholdTotal, calculatePapResultFromRE4, type MarriedEarnerSlice } from './pap'

export type RateBasis = 'gross' | 'zve'

/**
 * Actual social-contribution amount the employee pays — i.e. the sum of
 * pension (RV), health+care (KV+PV) and unemployment (AV) shares.
 *
 * For PKV (`pkv` > 0), the health+care slice is the **net** annual PKV cost
 * (premium minus employer subsidy) carried in `vspKrankenPflege`, not GKV %.
 * For Beamte presets, RV/ALV are usually off (`krv`/`alv`), so those terms
 * can be zero and only the PKV net remains in this sum.
 *
 * Note this differs from `point.vsp`: the PAP `vsp` field is the
 * tax-deductible Vorsorgepauschale used inside the income-tax formula,
 * which can underestimate the AV share when the vsphb path is capped at
 * 1900 EUR. For paycheck math (take-home, burden rates) we want the
 * actual contribution sum below.
 */
export function actualContributions(point: PapCalculationResult): number {
  return point.vspRenten + point.vspKrankenPflege + point.vspArbeitslosen
}

/** Employee RV + KV+PV + AV for one earner in a {@link PapCalculationResult.marriedEarners} slice. */
export function marriedEarnerEmployeeSocial(slice: MarriedEarnerSlice): number {
  return slice.vspRenten + slice.vspKrankenPflege + slice.vspArbeitslosen
}

export type MarriedChartReferenceIncomes = { income1: number; income2: number }

function papAtIncomeLevel(
  gross: number,
  options: PapOptions,
  marriedRef: MarriedChartReferenceIncomes | undefined,
): PapCalculationResult {
  if (options.filing === 'married' && marriedRef) {
    return calculatePapForMarriedHouseholdTotal(gross, marriedRef.income1, marriedRef.income2, options)
  }
  return calculatePapResultFromRE4(gross, options)
}

/**
 * Returns the rate as a percentage, or `null` when the denominator is too
 * small to give a meaningful number. Returning `null` (vs. clamping to 0)
 * lets the chart draw a gap instead of a giant spike at very low incomes
 * — e.g. `(payrollTax + VSP) / ZVE` when ZVE has been almost fully eaten
 * by VSP itself.
 */
export function ratePercent(
  point: PapCalculationResult,
  value: number,
  basis: RateBasis,
): number | null {
  const denominator = basis === 'zve' ? point.zve : point.income
  if (denominator < 1000) return null
  const rate = (value / denominator) * 100
  if (!Number.isFinite(rate) || rate > 100) return null
  return rate
}

export type MarginalTaxRateOptions = {
  /** Symmetric finite-difference half-window in EUR (default 500). */
  delta?: number
  /** Include VSP (social contributions) in the numerator. */
  includeVspInRate?: boolean
  /**
   * When `options.filing === 'married'`, scale both earners along the x-axis using this split ratio
   * (same logic as {@link calculatePapForMarriedHouseholdTotal}).
   */
  marriedChartRef?: MarriedChartReferenceIncomes
}

/**
 * Compute the marginal rate at a given income using a centered finite
 * difference: `(f(income+delta) − f(income−delta)) / basisDelta`.
 *
 * The numerator is the **payroll tax only** (capital gains tax is constant
 * in `income` and would cancel anyway). When `includeVspInRate` is true,
 * VSP is added to the numerator so the result represents the combined
 * burden of tax + social contributions.
 *
 * The denominator is either gross income (`upperIncome − lowerIncome`) or
 * the change in ZVE between the two sample points, depending on `basis`.
 */
export function marginalTaxRate(
  income: number,
  options: PapOptions,
  basis: RateBasis,
  { delta = 500, includeVspInRate = false, marriedChartRef }: MarginalTaxRateOptions = {},
): number {
  const lowerIncome = Math.max(0, income - delta)
  const upperIncome = income + delta
  const lower = papAtIncomeLevel(lowerIncome, options, marriedChartRef)
  const upper = papAtIncomeLevel(upperIncome, options, marriedChartRef)

  const basisDelta = basis === 'zve'
    ? upper.zve - lower.zve
    : upperIncome - lowerIncome

  if (basisDelta <= 0) return 0

  const upperAmount = includeVspInRate ? upper.payrollTax + actualContributions(upper) : upper.payrollTax
  const lowerAmount = includeVspInRate ? lower.payrollTax + actualContributions(lower) : lower.payrollTax

  return ((upperAmount - lowerAmount) / basisDelta) * 100
}

export type MarginalDecomposition = {
  /** Marginal UPTAB outside the capped 45% top-rate slice (see {@link reichenTariff}). */
  incomeTax: number
  /** Marginal effect of the 45% top tariff (“Reichensteuer”) on UPTAB. */
  reichenTariff: number
  /** Raw marginal wage UPTAB (= incomeTax + reichenTariff before capping splits). */
  incomeTaxRaw: number
  /** Marginal solidarity surcharge. */
  soli: number
  /** Marginal church tax. */
  church: number
  /** Marginal pension contribution (RV). */
  pension: number
  /** Marginal health + long-term-care contribution (KV + PV). */
  healthCare: number
  /** Marginal unemployment-insurance contribution (AV). */
  unemployment: number
  /** Sum of all components — equal to marginalTaxRate(..., includeVspInRate=true). */
  total: number
}

/**
 * Break the marginal *burden* (tax + Soli + church + full VSP) into its
 * underlying components, all expressed as a percentage of the chosen basis
 * (gross income or ZVE). Capital-gains tax / Soli / church are constant
 * in `re4` and therefore cancel out of every Δ — so the decomposition is
 * always invariant to `investmentIncome`.
 *
 * Each component uses the same symmetric finite-difference window as
 * `marginalTaxRate`, so summing the components reproduces
 * `marginalTaxRate(..., includeVspInRate=true)` to numerical precision.
 */
export function marginalDecomposition(
  income: number,
  options: PapOptions,
  basis: RateBasis,
  { delta = 500, marriedChartRef }: { delta?: number; marriedChartRef?: MarriedChartReferenceIncomes } = {},
): MarginalDecomposition {
  const lowerIncome = Math.max(0, income - delta)
  const upperIncome = income + delta
  const lower = papAtIncomeLevel(lowerIncome, options, marriedChartRef)
  const upper = papAtIncomeLevel(upperIncome, options, marriedChartRef)

  const basisDelta = basis === 'zve'
    ? upper.zve - lower.zve
    : upperIncome - lowerIncome

  if (basisDelta <= 0) {
    return {
      incomeTax: 0,
      reichenTariff: 0,
      incomeTaxRaw: 0,
      soli: 0,
      church: 0,
      pension: 0,
      healthCare: 0,
      unemployment: 0,
      total: 0,
    }
  }

  const pct = (delta: number) => (delta / basisDelta) * 100

  // Pure income tax (UPTAB base only) = baseTax - investmentTax. Since
  // investmentTax is constant in re4, ΔbaseTax = Δbase.
  const incomeTaxRaw = pct((upper.baseTax - upper.investmentTax) - (lower.baseTax - lower.investmentTax))
  const reichenMarginal = pct(upper.reichenTariffEur - lower.reichenTariffEur)
  const reichenTariff = Math.min(Math.max(0, reichenMarginal), Math.max(0, incomeTaxRaw))
  const incomeTax = incomeTaxRaw - reichenTariff
  const soli = pct((upper.solz - upper.investmentSolz) - (lower.solz - lower.investmentSolz))
  const church = pct((upper.church - upper.investmentChurch) - (lower.church - lower.investmentChurch))
  const pension = pct(upper.vspRenten - lower.vspRenten)
  const healthCare = pct(upper.vspKrankenPflege - lower.vspKrankenPflege)
  const unemployment = pct(upper.vspArbeitslosen - lower.vspArbeitslosen)
  const total = incomeTaxRaw + soli + church + pension + healthCare + unemployment

  return { incomeTax, reichenTariff, incomeTaxRaw, soli, church, pension, healthCare, unemployment, total }
}

/**
 * Marginal payroll-tax share (LSt + Soli + KiSt on wages) attributable to the 45% top-rate slice,
 * as % of gross or ZVE (same finite-difference window as {@link marginalTaxRate}).
 */
export function marginalReichenPayrollPercent(
  income: number,
  options: PapOptions,
  basis: RateBasis,
  { delta = 500, marriedChartRef }: { delta?: number; marriedChartRef?: MarriedChartReferenceIncomes } = {},
): number | null {
  const lowerIncome = Math.max(0, income - delta)
  const upperIncome = income + delta
  const lower = papAtIncomeLevel(lowerIncome, options, marriedChartRef)
  const upper = papAtIncomeLevel(upperIncome, options, marriedChartRef)

  const basisDelta =
    basis === 'zve' ? upper.zve - lower.zve : upperIncome - lowerIncome
  if (basisDelta <= 0) return null

  const p = ((upper.reichenPayrollEur - lower.reichenPayrollEur) / basisDelta) * 100
  if (!Number.isFinite(p)) return null
  return Math.max(0, p)
}
