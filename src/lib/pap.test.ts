import { describe, it, expect } from 'vitest'
import {
  JAEG_2025,
  JAEG_2026,
  calculatePapForMarriedHouseholdTotal,
  calculatePapTax,
  calculatePapResultFromRE4,
  jaegFor,
} from './pap'
import { actualContributions } from './rates'

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

  it('splits VSP into Renten- und Arbeitslosenversicherung (chart decomposition)', () => {
    const r = calculatePapResultFromRE4(80_000, {
      year: 2025,
      filing: 'single',
      children: 0,
      solidarity: false,
      churchRate: 0,
      pkv: 0,
      kvz: 1.7,
    })
    expect(r.vspRenten).toBeGreaterThan(0)
    expect(r.vspArbeitslosen).toBeGreaterThan(0)
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

  it('honors a pro-mode bbgKvPv override (raised cap → larger deduction)', () => {
    // High earner, well above both the default and overridden BBGKVPV.
    const baseline = calculatePapResultFromRE4(150_000, {
      year: 2026,
      filing: 'single',
      children: 0,
      solidarity: false,
      churchRate: 0,
    })
    const reformed = calculatePapResultFromRE4(150_000, {
      year: 2026,
      filing: 'single',
      children: 0,
      solidarity: false,
      churchRate: 0,
      bbgKvPv: 73_350, // Kabinett 2026 reform
    })
    expect(reformed.vspKrankenPflege).toBeGreaterThan(baseline.vspKrankenPflege)
    // Higher deductible → lower ZVE → lower income tax.
    expect(reformed.tax).toBeLessThan(baseline.tax)
  })

  it('honors a pro-mode bbgRvAlv override (raised cap → more pension contributions)', () => {
    const baseline = calculatePapResultFromRE4(150_000, { year: 2026, solidarity: false })
    const reformed = calculatePapResultFromRE4(150_000, {
      year: 2026,
      solidarity: false,
      bbgRvAlv: 121_680, // hypothetical Klingbeil pension cap
    })
    expect(reformed.vspRenten).toBeGreaterThan(baseline.vspRenten)
    expect(reformed.vspArbeitslosen).toBeGreaterThan(baseline.vspArbeitslosen)
  })

  it('jaegFor accepts a positive override and ignores zero/undefined', () => {
    expect(jaegFor(2026, 81_000)).toBe(81_000)
    expect(jaegFor(2026, 0)).toBe(JAEG_2026)
    expect(jaegFor(2026)).toBe(JAEG_2026)
  })

  it('Beamtenmodus bundle: no RV or ALV contributions in VSP path', () => {
    const beamt = calculatePapResultFromRE4(80_000, {
      year: 2026,
      filing: 'single',
      children: 0,
      solidarity: false,
      churchRate: 0,
      krv: 1,
      alv: 1,
      pkv: 2,
      pkpv: 25_000,
      pkpvagz: 12_500,
    })
    const angest = calculatePapResultFromRE4(80_000, {
      year: 2026,
      filing: 'single',
      children: 0,
      solidarity: false,
      churchRate: 0,
      pkv: 0,
      kvz: 1.7,
    })
    expect(beamt.vspRenten).toBe(0)
    expect(beamt.vspArbeitslosen).toBe(0)
    expect(angest.vspRenten).toBeGreaterThan(0)
    expect(angest.vspArbeitslosen).toBeGreaterThan(0)
    // Higher ZVE for employee when Beamter has small PKV rest vs high GKV deduction
    expect(beamt.zve).toBeGreaterThanOrEqual(angest.zve - 1)
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

describe('married household two-earner model', () => {
  const marriedOpts = {
    year: 2026 as const,
    filing: 'married' as const,
    stkl: 4 as const,
    children: 0,
    solidarity: false,
    churchRate: 0,
    pkv: 0 as const,
    kvz: 1.7,
  }

  it('runs VSP per earner and attaches marriedEarners slices', () => {
    const twoEarner = calculatePapResultFromRE4(80_000, { ...marriedOpts, partnerRe4: 80_000 })
    expect(twoEarner.marriedEarners).toBeDefined()
    expect(twoEarner.marriedEarners![0].income).toBe(80_000)
    expect(twoEarner.marriedEarners![1].income).toBe(80_000)
    const lump = calculatePapResultFromRE4(160_000, marriedOpts)
    expect(actualContributions(twoEarner)).toBeGreaterThan(actualContributions(lump))
  })

  it('calculatePapForMarriedHouseholdTotal keeps the reference income ratio', () => {
    const r = calculatePapForMarriedHouseholdTotal(100_000, 60_000, 40_000, marriedOpts)
    expect(r.income).toBe(100_000)
    expect(r.marriedEarners![0].income).toBe(60_000)
    expect(r.marriedEarners![1].income).toBe(40_000)
  })
})
