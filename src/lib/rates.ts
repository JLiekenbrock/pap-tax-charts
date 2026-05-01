import { PapCalculationResult, PapOptions, calculatePapResultFromRE4 } from './pap'

export type RateBasis = 'gross' | 'zve'

/**
 * Actual social-contribution amount the employee pays — i.e. the sum of
 * pension (RV), health+care (KV+PV) and unemployment (AV) shares.
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
  { delta = 500, includeVspInRate = false }: MarginalTaxRateOptions = {},
): number {
  const lowerIncome = Math.max(0, income - delta)
  const upperIncome = income + delta
  const lower = calculatePapResultFromRE4(lowerIncome, options)
  const upper = calculatePapResultFromRE4(upperIncome, options)

  const basisDelta = basis === 'zve'
    ? upper.zve - lower.zve
    : upperIncome - lowerIncome

  if (basisDelta <= 0) return 0

  const upperAmount = includeVspInRate ? upper.payrollTax + actualContributions(upper) : upper.payrollTax
  const lowerAmount = includeVspInRate ? lower.payrollTax + actualContributions(lower) : lower.payrollTax

  return ((upperAmount - lowerAmount) / basisDelta) * 100
}

export type MarginalDecomposition = {
  /** Marginal income tax (the progressive UPTAB base, no Soli/church). */
  incomeTax: number
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
  { delta = 500 }: { delta?: number } = {},
): MarginalDecomposition {
  const lowerIncome = Math.max(0, income - delta)
  const upperIncome = income + delta
  const lower = calculatePapResultFromRE4(lowerIncome, options)
  const upper = calculatePapResultFromRE4(upperIncome, options)

  const basisDelta = basis === 'zve'
    ? upper.zve - lower.zve
    : upperIncome - lowerIncome

  if (basisDelta <= 0) {
    return { incomeTax: 0, soli: 0, church: 0, pension: 0, healthCare: 0, unemployment: 0, total: 0 }
  }

  const pct = (delta: number) => (delta / basisDelta) * 100

  // Pure income tax (UPTAB base only) = baseTax - investmentTax. Since
  // investmentTax is constant in re4, ΔbaseTax = Δbase.
  const incomeTax = pct((upper.baseTax - upper.investmentTax) - (lower.baseTax - lower.investmentTax))
  const soli = pct((upper.solz - upper.investmentSolz) - (lower.solz - lower.investmentSolz))
  const church = pct((upper.church - upper.investmentChurch) - (lower.church - lower.investmentChurch))
  const pension = pct(upper.vspRenten - lower.vspRenten)
  const healthCare = pct(upper.vspKrankenPflege - lower.vspKrankenPflege)
  const unemployment = pct(upper.vspArbeitslosen - lower.vspArbeitslosen)
  const total = incomeTax + soli + church + pension + healthCare + unemployment

  return { incomeTax, soli, church, pension, healthCare, unemployment, total }
}
