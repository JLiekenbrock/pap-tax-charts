import { describe, it, expect } from 'vitest'
import { JAEG_2025, JAEG_2026, calculatePapTax, calculatePapResultFromRE4, jaegFor } from './pap'

describe('PAP 2025 tariff (UPTAB25) basic checks', () => {
  it('returns 0 below basic allowance', () => {
    expect(calculatePapTax(12000, { year: 2025, filing: 'single', children: 0, solidarity: false })).toBe(0)
  })

  it('computes tax for income around first bracket (17444)', () => {
    const tLow = calculatePapTax(17444, { year: 2025, filing: 'single', children: 0, solidarity: false })
    const tHigh = calculatePapTax(18000, { year: 2025, filing: 'single', children: 0, solidarity: false })
    expect(tLow).toBeGreaterThanOrEqual(0)
    expect(tHigh).toBeGreaterThan(tLow)
  })

  it('computes linear middle bracket around 68480', () => {
    const t1 = calculatePapTax(68000, { year: 2025, filing: 'single', children: 0, solidarity: false })
    const t2 = calculatePapTax(69000, { year: 2025, filing: 'single', children: 0, solidarity: false })
    expect(t2).toBeGreaterThan(t1)
  })

  it('computes very large incomes in top bracket', () => {
    const t = calculatePapTax(400000, { year: 2025, filing: 'single', children: 0, solidarity: false })
    // Tax should be less than income but sizable
    expect(t).toBeGreaterThan(100000)
    expect(t).toBeLessThan(400000)
  })
})

describe('Solidaritätszuschlag Milderungszone (SolZG §4)', () => {
  const SOLZ_FREE_2026 = 20_350

  function soli(re4: number) {
    return calculatePapResultFromRE4(re4, {
      year: 2026,
      filing: 'single',
      children: 0,
      solidarity: true,
      churchRate: 0,
    }).solz
  }

  function base(re4: number) {
    return calculatePapResultFromRE4(re4, {
      year: 2026,
      filing: 'single',
      children: 0,
      solidarity: true,
      churchRate: 0,
    }).base
  }

  it('is zero when the wage tax base is at or below the Freigrenze', () => {
    // Find an income whose base is ≤ Freigrenze. ~70k EUR salary → base ≈ 14k.
    const result = calculatePapResultFromRE4(70_000, { year: 2026, solidarity: true })
    expect(result.base).toBeLessThanOrEqual(SOLZ_FREE_2026)
    expect(result.solz).toBe(0)
  })

  it('phases in via the 11.9% taper just above the Freigrenze (no spike)', () => {
    // Find an income where base sits just above Freigrenze (around 90-95k EUR salary).
    let lowSalary = 70_000
    let highSalary = 100_000
    for (let i = 0; i < 20; i++) {
      const mid = Math.round((lowSalary + highSalary) / 2)
      if (base(mid) <= SOLZ_FREE_2026) lowSalary = mid
      else highSalary = mid
    }
    const justBelow = base(lowSalary)
    const justAbove = base(highSalary)
    expect(justBelow).toBeLessThanOrEqual(SOLZ_FREE_2026)
    expect(justAbove).toBeGreaterThan(SOLZ_FREE_2026)

    const soliJustBelow = soli(lowSalary)
    const soliJustAbove = soli(highSalary)
    // Without the Milderungszone, soliJustAbove would jump to ~5.5 % × 20.4k ≈ 1119 EUR.
    // With it, the jump is bounded by 0.119 × (justAbove − Freigrenze), which over a
    // 1 EUR base step is at most ~0.12 EUR.
    const baseGap = justAbove - justBelow
    expect(soliJustAbove - soliJustBelow).toBeLessThanOrEqual(0.119 * baseGap + 1)
  })

  it('reaches the regular 5.5% rate well above the taper zone', () => {
    // At ~250k EUR salary the soli should match 5.5 % × base within rounding.
    const result = calculatePapResultFromRE4(250_000, { year: 2026, solidarity: true })
    expect(result.solz).toBe(Math.round(result.base * 0.055))
  })

  it('is monotone non-decreasing across the threshold', () => {
    let prev = -1
    for (let salary = 70_000; salary <= 110_000; salary += 500) {
      const s = soli(salary)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })
})

describe('Private health insurance (PKV)', () => {
  const baseOptions = {
    year: 2026,
    filing: 'single' as const,
    children: 0,
    solidarity: false,
    churchRate: 0,
  }

  it('overrides vspKrankenPflege with (premium - employer subsidy) for pkv > 0', () => {
    // EUR 600/month premium, EUR 300/month subsidy → EUR 3,600/year deductible.
    const r = calculatePapResultFromRE4(60_000, {
      ...baseOptions,
      pkv: 1,
      pkpv: 60_000, // cents/month
      pkpvagz: 30_000,
    })
    expect(r.vspKrankenPflege).toBeCloseTo(3_600, 0)
  })

  it('produces an income-independent vspKrankenPflege under PKV', () => {
    // Unlike GKV (which scales with capped income), PKV is a flat amount.
    const opts = { ...baseOptions, pkv: 1 as const, pkpv: 70_000, pkpvagz: 35_000 }
    const r1 = calculatePapResultFromRE4(40_000, opts)
    const r2 = calculatePapResultFromRE4(120_000, opts)
    expect(r1.vspKrankenPflege).toBeCloseTo(r2.vspKrankenPflege, 0)
  })

  it('clamps at zero when employer subsidy exceeds the premium', () => {
    const r = calculatePapResultFromRE4(60_000, {
      ...baseOptions,
      pkv: 1,
      pkpv: 50_000,
      pkpvagz: 80_000,
    })
    expect(r.vspKrankenPflege).toBe(0)
  })

  it('exposes the JAEG (Versicherungspflichtgrenze) constants and selector', () => {
    expect(JAEG_2025).toBe(73_800)
    expect(JAEG_2026).toBe(77_400)
    expect(jaegFor(2025)).toBe(73_800)
    expect(jaegFor(2026)).toBe(77_400)
    // 2026 raised the threshold meaningfully (+4.9 % approx).
    expect(JAEG_2026).toBeGreaterThan(JAEG_2025)
  })

  it('PKV with low premium increases tax vs equivalent GKV (smaller deduction)', () => {
    // GKV is the baseline.
    const gkv = calculatePapResultFromRE4(80_000, {
      ...baseOptions,
      pkv: 0,
      kvz: 1.7,
    })
    // Cheap PKV: EUR 400/month premium, EUR 200/month subsidy → EUR 2,400/yr deductible.
    const pkv = calculatePapResultFromRE4(80_000, {
      ...baseOptions,
      pkv: 1,
      pkpv: 40_000,
      pkpvagz: 20_000,
    })
    expect(pkv.vspKrankenPflege).toBeLessThan(gkv.vspKrankenPflege)
    expect(pkv.tax).toBeGreaterThan(gkv.tax)
  })
})
