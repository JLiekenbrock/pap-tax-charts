import { describe, expect, it } from 'vitest'
import {
  DESTATIS_INCOME_TAX_BRACKETS_2021,
  destatisIncomeTaxBracketForApproxEinkommen,
  destatisMassWeightedAssessedIncomeTaxOnlyPct,
} from './destatis_income_tax_brackets_2021'

describe('destatisIncomeTaxBracketForApproxEinkommen', () => {
  it('places 55k in 50–60k with ~14.8% aggregate assessed income tax', () => {
    const b = destatisIncomeTaxBracketForApproxEinkommen(55_000)
    expect(b).not.toBeNull()
    expect(b!.lo).toBe(50_000)
    expect(b!.hi).toBe(60_000)
    expect(b!.empiricalAssessedIncomeTaxPct).toBeCloseTo(14.83, 1)
    expect(b!.adjustedGrossIncomeMassThousandEur).toBe(166_523_902)
  })

  it('uses half-open intervals: 60k lands in 60–70k', () => {
    const b = destatisIncomeTaxBracketForApproxEinkommen(60_000)
    expect(b!.lo).toBe(60_000)
    expect(b!.hi).toBe(70_000)
  })

  it('covers top open band', () => {
    const b = destatisIncomeTaxBracketForApproxEinkommen(2_000_000)
    expect(b!.hi).toBeNull()
    expect(b!.lo).toBe(1_000_000)
  })

  it('all brackets have positive width or open top', () => {
    for (const row of DESTATIS_INCOME_TAX_BRACKETS_2021) {
      if (row.hi !== null) expect(row.hi).toBeGreaterThan(row.lo)
      expect(row.empiricalAssessedIncomeTaxPct).toBeGreaterThanOrEqual(0)
      expect(row.empiricalAssessedIncomeTaxPct).toBeLessThan(90)
      expect(row.adjustedGrossIncomeMassThousandEur).toBeGreaterThan(0)
    }
  })

  it('mass-weighted income-tax-only % equals Σ tax / Σ income from RAW scale', () => {
    const sumTax = 388_099 + 483_628 + 1_021_645 + 2_920_989 + 4_993_263 + 7_430_891 + 9_963_954
      + 12_127_197 + 12_996_609 + 12_881_294 + 24_697_749 + 22_473_103 + 85_981_831 + 68_248_810
      + 34_853_749 + 19_665_687 + 35_461_945
    const sumInc = 7_480_434 + 17_851_525 + 39_902_164 + 62_692_463 + 75_016_710 + 91_472_829
      + 100_440_834 + 104_647_140 + 101_619_120 + 94_193_859 + 166_523_902 + 139_003_998 + 448_444_143
      + 262_642_612 + 107_367_770 + 55_537_482 + 98_259_228
    const expected = (sumTax / sumInc) * 100
    expect(destatisMassWeightedAssessedIncomeTaxOnlyPct()).toBeCloseTo(expected, 8)
  })
})
