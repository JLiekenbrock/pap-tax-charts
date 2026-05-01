/**
 * Destatis Jahreslohn- und Einkommensteuerstatistik 2021, Tabelle
 * “Income tax to be assessed” / “Adjusted gross income” by band.
 * All income and tax figures in 1000 EUR; rate = tax / income (same units cancel).
 *
 * https://www.destatis.de/EN/Themes/Government/Taxes/Wage-Income-Tax/Tables/annual-income-tax-statistics.html
 *
 * Bands are **Einkommen** (assessment income), “from … to under … EUR”.
 * We place users by **gross RE4 as a rough proxy** — see PrivilegeCheck copy.
 */

export type DestatisIncomeTaxBracket = {
  /** Lower bound inclusive, EUR */
  lo: number
  /** Upper bound exclusive; null = no upper bound */
  hi: number | null
  /** Σ assessed income tax / Σ adjusted gross income in band, % */
  empiricalAssessedIncomeTaxPct: number
  /** Σ adjusted gross income in band, 1000 EUR (table column, for weighting) */
  adjustedGrossIncomeMassThousandEur: number
}

/** Thousand EUR aggregates (table as published). */
const RAW: ReadonlyArray<
  readonly [lo: number, hi: number | null, incomeThousandEur: number, taxThousandEur: number]
> = [
  [0, 5_000, 7_480_434, 388_099],
  [5_000, 10_000, 17_851_525, 483_628],
  [10_000, 15_000, 39_902_164, 1_021_645],
  [15_000, 20_000, 62_692_463, 2_920_989],
  [20_000, 25_000, 75_016_710, 4_993_263],
  [25_000, 30_000, 91_472_829, 7_430_891],
  [30_000, 35_000, 100_440_834, 9_963_954],
  [35_000, 40_000, 104_647_140, 12_127_197],
  [40_000, 45_000, 101_619_120, 12_996_609],
  [45_000, 50_000, 94_193_859, 12_881_294],
  [50_000, 60_000, 166_523_902, 24_697_749],
  [60_000, 70_000, 139_003_998, 22_473_103],
  [70_000, 125_000, 448_444_143, 85_981_831],
  [125_000, 250_000, 262_642_612, 68_248_810],
  [250_000, 500_000, 107_367_770, 34_853_749],
  [500_000, 1_000_000, 55_537_482, 19_665_687],
  [1_000_000, null, 98_259_228, 35_461_945],
] as const

export const DESTATIS_INCOME_TAX_BRACKETS_2021: ReadonlyArray<DestatisIncomeTaxBracket> = RAW.map(
  ([lo, hi, incomeK, taxK]) => ({
    lo,
    hi,
    empiricalAssessedIncomeTaxPct: incomeK > 0 ? (taxK / incomeK) * 100 : 0,
    adjustedGrossIncomeMassThousandEur: incomeK,
  }),
)

/**
 * Mass-weighted average of (Σ assessed income tax / Σ Einkommen) across bands —
 * algebraically equals **national** aggregate assessed income tax / aggregate Einkommen in this table.
 * The annual income tax statistics do **not** include employee social-security contributions.
 */
export function destatisMassWeightedAssessedIncomeTaxOnlyPct(
  brackets: ReadonlyArray<DestatisIncomeTaxBracket> = DESTATIS_INCOME_TAX_BRACKETS_2021,
): number {
  let wSum = 0
  let weightedPct = 0
  for (const b of brackets) {
    const w = b.adjustedGrossIncomeMassThousandEur
    if (w <= 0) continue
    wSum += w
    weightedPct += w * b.empiricalAssessedIncomeTaxPct
  }
  return wSum > 0 ? weightedPct / wSum : 0
}

export function destatisIncomeTaxBracketForApproxEinkommen(
  approxEinkommenEur: number,
): DestatisIncomeTaxBracket | null {
  if (!Number.isFinite(approxEinkommenEur) || approxEinkommenEur < 0) return null
  for (const b of DESTATIS_INCOME_TAX_BRACKETS_2021) {
    if (b.hi === null) {
      if (approxEinkommenEur >= b.lo) return b
    } else if (approxEinkommenEur >= b.lo && approxEinkommenEur < b.hi) {
      return b
    }
  }
  return null
}

export function formatDestatisBracketLabel(b: DestatisIncomeTaxBracket): string {
  if (b.hi === null) {
    return `${b.lo.toLocaleString()} EUR+`
  }
  return `${b.lo.toLocaleString()}–${b.hi.toLocaleString()} EUR`
}
