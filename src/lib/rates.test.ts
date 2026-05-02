import { describe, it, expect } from 'vitest'
import { PapCalculationResult, PapOptions, calculatePapResultFromRE4 } from './pap'
import { marginalDecomposition, marginalTaxRate, ratePercent } from './rates'

const baseOptions: PapOptions = {
  year: 2026,
  filing: 'single',
  children: 0,
  solidarity: true,
  churchRate: 0,
}

function point(income: number, opts: PapOptions = baseOptions): PapCalculationResult {
  return calculatePapResultFromRE4(income, opts)
}

describe('ratePercent', () => {
  it('returns null when denominator is below the meaningfulness threshold', () => {
    const p = { income: 500, zve: 0 } as PapCalculationResult
    expect(ratePercent(p, 100, 'gross')).toBeNull()
    expect(ratePercent(p, 100, 'zve')).toBeNull()
  })

  it('uses gross income as denominator on basis="gross"', () => {
    const p = { income: 50_000, zve: 30_000 } as PapCalculationResult
    expect(ratePercent(p, 5_000, 'gross')).toBeCloseTo(10, 6)
  })

  it('uses ZVE as denominator on basis="zve"', () => {
    const p = { income: 50_000, zve: 30_000 } as PapCalculationResult
    expect(ratePercent(p, 6_000, 'zve')).toBeCloseTo(20, 6)
  })

  it('returns null when the resulting rate exceeds 100% (degenerate case)', () => {
    const p = { income: 10_000, zve: 1_500 } as PapCalculationResult
    // 2_000 / 1_500 ≈ 133% — physically impossible as a tax rate, must be skipped
    expect(ratePercent(p, 2_000, 'zve')).toBeNull()
  })

  it('returns null when the rate is not finite', () => {
    const p = { income: 10_000, zve: 0 } as PapCalculationResult
    expect(ratePercent(p, 100, 'zve')).toBeNull()
  })

  it('clamps boundary at exactly the meaningfulness threshold', () => {
    const justBelow = { income: 999, zve: 999 } as PapCalculationResult
    const justAt = { income: 1_000, zve: 1_000 } as PapCalculationResult
    expect(ratePercent(justBelow, 50, 'gross')).toBeNull()
    expect(ratePercent(justAt, 50, 'gross')).toBeCloseTo(5, 6)
  })
})

describe('marginalTaxRate', () => {
  describe('on gross-income basis', () => {
    it('is 0 well below the Grundfreibetrag', () => {
      // GFB 2026 = 12_348. With ANP/SAP/EFA + VSP eating ~20% of salary, no
      // tax is owed up to roughly 16k EUR salary, so the marginal payroll-tax
      // rate must be exactly 0 there.
      const m = marginalTaxRate(8_000, baseOptions, 'gross')
      expect(m).toBe(0)
    })

    it('is positive once salary clears the tax threshold', () => {
      const m = marginalTaxRate(40_000, baseOptions, 'gross')
      expect(m).toBeGreaterThan(0)
    })

    it('is monotonically (non-strictly) non-decreasing across the progressive zone', () => {
      const samples = [25_000, 35_000, 50_000, 70_000].map((income) =>
        marginalTaxRate(income, baseOptions, 'gross'),
      )
      for (let i = 1; i < samples.length; i++) {
        // Tolerate tiny noise from PAP integer rounding.
        expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1)
      }
    })

    it('approaches the top bracket marginal rate (with Soli) at very high incomes', () => {
      // Top bracket on payroll tax = 45 % income tax × (1 + 0.055 Soli) ≈ 47.475 %
      const m = marginalTaxRate(500_000, baseOptions, 'gross')
      expect(m).toBeGreaterThan(45)
      expect(m).toBeLessThan(50)
    })

    it('matches a manual finite-difference computation', () => {
      const income = 60_000
      const lower = point(income - 500)
      const upper = point(income + 500)
      const expected = ((upper.payrollTax - lower.payrollTax) / 1_000) * 100
      expect(marginalTaxRate(income, baseOptions, 'gross')).toBeCloseTo(expected, 6)
    })
  })

  describe('on ZVE basis', () => {
    it('is higher than the gross-basis rate (ZVE < gross)', () => {
      const onGross = marginalTaxRate(50_000, baseOptions, 'gross')
      const onZve = marginalTaxRate(50_000, baseOptions, 'zve')
      expect(onZve).toBeGreaterThan(onGross)
    })

    it('returns 0 when ZVE does not move between sample points', () => {
      // Below the threshold where re4 produces any positive ZVE, the basis
      // delta is 0 and the function must short-circuit to 0 rather than NaN.
      const m = marginalTaxRate(0, baseOptions, 'zve')
      expect(m).toBe(0)
    })
  })

  describe('VSP inclusion', () => {
    it('strictly increases the rate when VSP is added to the numerator', () => {
      const without = marginalTaxRate(50_000, baseOptions, 'gross', { includeVspInRate: false })
      const withVsp = marginalTaxRate(50_000, baseOptions, 'gross', { includeVspInRate: true })
      expect(withVsp).toBeGreaterThan(without)
    })

    it('captures the VSP-only burden below the tax threshold', () => {
      // Below GFB the payroll-tax-only marginal is 0, but social
      // contributions still scale with income → the VSP-included variant
      // must show a positive rate.
      const taxOnly = marginalTaxRate(8_000, baseOptions, 'gross', { includeVspInRate: false })
      const burden = marginalTaxRate(8_000, baseOptions, 'gross', { includeVspInRate: true })
      expect(taxOnly).toBe(0)
      expect(burden).toBeGreaterThan(15)
      expect(burden).toBeLessThan(25)
    })
  })

  describe('investment income', () => {
    it('does not affect the marginal payroll-tax rate', () => {
      // Capital-gains tax is constant in re4 and would cancel in a finite
      // difference; therefore marginalTaxRate must be invariant to
      // investmentIncome regardless of basis or VSP toggle.
      const noInvest = marginalTaxRate(60_000, { ...baseOptions, investmentIncome: 0 }, 'gross')
      const withInvest = marginalTaxRate(60_000, { ...baseOptions, investmentIncome: 50_000 }, 'gross')
      expect(withInvest).toBeCloseTo(noInvest, 6)

      const noInvestVsp = marginalTaxRate(60_000, { ...baseOptions, investmentIncome: 0 }, 'zve', { includeVspInRate: true })
      const withInvestVsp = marginalTaxRate(60_000, { ...baseOptions, investmentIncome: 50_000 }, 'zve', { includeVspInRate: true })
      expect(withInvestVsp).toBeCloseTo(noInvestVsp, 6)
    })
  })

  describe('delta parameter', () => {
    it('produces similar results for reasonable delta values inside the same bracket', () => {
      const small = marginalTaxRate(60_000, baseOptions, 'gross', { delta: 100 })
      const medium = marginalTaxRate(60_000, baseOptions, 'gross', { delta: 500 })
      const large = marginalTaxRate(60_000, baseOptions, 'gross', { delta: 2_000 })
      // Within ~1 percentage point of each other in a smooth bracket region.
      expect(Math.abs(medium - small)).toBeLessThan(1)
      expect(Math.abs(large - medium)).toBeLessThan(1)
    })

    it('clamps the lower sample to 0 when delta would produce a negative income', () => {
      // At income=200 with delta=500, lower would otherwise be -300; the
      // implementation clamps to 0, which keeps the result well-defined
      // (zero in this regime since both end-points yield zero payroll tax).
      const m = marginalTaxRate(200, baseOptions, 'gross', { delta: 500 })
      expect(Number.isFinite(m)).toBe(true)
      expect(m).toBe(0)
    })
  })

  describe('soli kink', () => {
    it('is bounded across the Solidaritätszuschlag transition zone', () => {
      // Around the Soli phase-in (~96k single 2026), the marginal-rate curve
      // can spike sharply. The raw marginal must still stay below 100 %.
      for (const income of [80_000, 90_000, 95_000, 100_000, 110_000]) {
        const m = marginalTaxRate(income, baseOptions, 'gross')
        expect(m).toBeGreaterThan(0)
        expect(m).toBeLessThan(100)
      }
    })
  })
})

describe('marginalDecomposition', () => {
  it('components sum to the burden marginal rate (gross basis)', () => {
    const total = marginalTaxRate(50_000, baseOptions, 'gross', { includeVspInRate: true })
    const parts = marginalDecomposition(50_000, baseOptions, 'gross')
    expect(parts.total).toBeCloseTo(total, 6)
    expect(
      parts.incomeTax + parts.reichenTariff + parts.soli + parts.church + parts.pension + parts.healthCare + parts.unemployment,
    ).toBeCloseTo(total, 6)
  })

  it('components sum to the burden marginal rate (zve basis)', () => {
    const total = marginalTaxRate(50_000, baseOptions, 'zve', { includeVspInRate: true })
    const parts = marginalDecomposition(50_000, baseOptions, 'zve')
    expect(parts.total).toBeCloseTo(total, 6)
  })

  it('is invariant to investmentIncome (capital-gains pieces cancel in Δ)', () => {
    const a = marginalDecomposition(60_000, { ...baseOptions, investmentIncome: 0 }, 'gross')
    const b = marginalDecomposition(60_000, { ...baseOptions, investmentIncome: 50_000 }, 'gross')
    for (const key of ['incomeTax', 'reichenTariff', 'incomeTaxRaw', 'soli', 'church', 'pension', 'healthCare', 'unemployment', 'total'] as const) {
      expect(b[key]).toBeCloseTo(a[key], 6)
    }
  })

  it('is invariant to solidarity toggle for VSP components', () => {
    const withSoli = marginalDecomposition(60_000, { ...baseOptions, solidarity: true }, 'gross')
    const noSoli = marginalDecomposition(60_000, { ...baseOptions, solidarity: false }, 'gross')
    expect(noSoli.pension).toBeCloseTo(withSoli.pension, 6)
    expect(noSoli.healthCare).toBeCloseTo(withSoli.healthCare, 6)
    expect(noSoli.unemployment).toBeCloseTo(withSoli.unemployment, 6)
  })

  it('zeroes the soli component when solidarity is disabled', () => {
    const m = marginalDecomposition(80_000, { ...baseOptions, solidarity: false }, 'gross')
    expect(m.soli).toBe(0)
  })

  it('zeroes the church component when churchRate is 0', () => {
    const m = marginalDecomposition(60_000, { ...baseOptions, churchRate: 0 }, 'gross')
    expect(m.church).toBe(0)
  })

  it('produces a positive church component when church tax applies', () => {
    const m = marginalDecomposition(60_000, { ...baseOptions, churchRate: 0.09 }, 'gross')
    expect(m.church).toBeGreaterThan(0)
  })

  it('shows full VSP layers active well below the BBG', () => {
    // At 30k single, all three VSP layers (RV, KV+PV, AV) are still in
    // the linear regime — every additional EUR scales them up.
    const m = marginalDecomposition(30_000, baseOptions, 'gross')
    expect(m.pension).toBeGreaterThan(0)
    expect(m.healthCare).toBeGreaterThan(0)
    expect(m.unemployment).toBeGreaterThan(0)
  })

  it('zeros KV+PV above BBGKVPV (~69_750 EUR salary 2026)', () => {
    // Sample well above the cap so the symmetric finite-difference window
    // is fully on the flat side of the cliff.
    const m = marginalDecomposition(85_000, baseOptions, 'gross', { delta: 500 })
    expect(m.healthCare).toBeCloseTo(0, 6)
  })

  it('zeros pension + unemployment above BBGRVALV (~101_400 EUR salary 2026)', () => {
    const m = marginalDecomposition(120_000, baseOptions, 'gross', { delta: 500 })
    expect(m.pension).toBeCloseTo(0, 6)
    expect(m.unemployment).toBeCloseTo(0, 6)
  })

  it('returns zeroed structure when basis delta is non-positive', () => {
    const m = marginalDecomposition(0, baseOptions, 'zve')
    expect(m.total).toBe(0)
    expect(m.incomeTax).toBe(0)
    expect(m.reichenTariff).toBe(0)
    expect(m.pension).toBe(0)
  })

  it('income tax + Reichensteuer matches raw marginal UPTAB finite difference', () => {
    const income = 50_000
    const lower = calculatePapResultFromRE4(income - 500, baseOptions)
    const upper = calculatePapResultFromRE4(income + 500, baseOptions)
    const expectedRaw = ((upper.baseTax - lower.baseTax) / 1_000) * 100
    const m = marginalDecomposition(income, baseOptions, 'gross')
    expect(m.incomeTaxRaw).toBeCloseTo(expectedRaw, 6)
    expect(m.incomeTax + m.reichenTariff).toBeCloseTo(m.incomeTaxRaw, 6)
  })
})
