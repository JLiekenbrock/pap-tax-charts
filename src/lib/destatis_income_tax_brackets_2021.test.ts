import { describe, expect, it } from 'vitest'
import { DESTATIS_INCOME_TAX_BRACKETS_2021, destatisIncomeTaxBracketForApproxEinkommen } from './destatis_income_tax_brackets_2021'

describe('destatisIncomeTaxBracketForApproxEinkommen', () => {
  it('places 55k in 50–60k with ~14.8% aggregate assessed income tax', () => {
    const b = destatisIncomeTaxBracketForApproxEinkommen(55_000)
    expect(b).not.toBeNull()
    expect(b!.lo).toBe(50_000)
    expect(b!.hi).toBe(60_000)
    expect(b!.empiricalAssessedIncomeTaxPct).toBeCloseTo(14.83, 1)
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
    }
  })
})
