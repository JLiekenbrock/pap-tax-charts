import { describe, it, expect } from 'vitest'
import { deriveStkl } from './stkl'

describe('deriveStkl: single filers', () => {
  it('returns Steuerklasse 1 for single with no children', () => {
    const d = deriveStkl({ filing: 'single', children: 0, income1: 60_000, income2: 0 })
    expect(d.stkl).toBe(1)
    expect(d.partnerStkl).toBeNull()
  })

  it('returns Steuerklasse 2 for single parent (children > 0)', () => {
    const d = deriveStkl({ filing: 'single', children: 1, income1: 60_000, income2: 0 })
    expect(d.stkl).toBe(2)
    expect(d.partnerStkl).toBeNull()
    expect(d.reason).toMatch(/Entlastungsbetrag/)
  })

  it('returns Steuerklasse 2 even for fractional ZKF (shared custody, partial allowance)', () => {
    const d = deriveStkl({ filing: 'single', children: 0.5, income1: 60_000, income2: 0 })
    expect(d.stkl).toBe(2)
  })
})

describe('deriveStkl: married 4/4 vs 3/5', () => {
  it('uses 4/4 when both partners earn within 10 % of equal', () => {
    const d = deriveStkl({ filing: 'married', children: 0, income1: 55_000, income2: 50_000 })
    expect(d.stkl).toBe(4)
    expect(d.partnerStkl).toBe(4)
  })

  it('uses 3/5 with user as 3 when user earns clearly more', () => {
    const d = deriveStkl({ filing: 'married', children: 0, income1: 100_000, income2: 30_000 })
    expect(d.stkl).toBe(3)
    expect(d.partnerStkl).toBe(5)
  })

  it('uses 5/3 with user as 5 when spouse earns clearly more', () => {
    const d = deriveStkl({ filing: 'married', children: 0, income1: 30_000, income2: 100_000 })
    expect(d.stkl).toBe(5)
    expect(d.partnerStkl).toBe(3)
  })

  it('falls back to 4/4 when no income data is given for a married couple', () => {
    const d = deriveStkl({ filing: 'married', children: 0, income1: 0, income2: 0 })
    expect(d.stkl).toBe(4)
    expect(d.partnerStkl).toBe(4)
  })

  it('uses 3/5 when one partner has zero income', () => {
    const d = deriveStkl({ filing: 'married', children: 0, income1: 80_000, income2: 0 })
    expect(d.stkl).toBe(3)
    expect(d.partnerStkl).toBe(5)
  })
})

describe('deriveStkl: equality boundary', () => {
  it('treats 60/40 income split as unequal (3/5)', () => {
    const d = deriveStkl({ filing: 'married', children: 0, income1: 60_000, income2: 40_000 })
    expect(d.stkl).toBe(3)
  })

  it('treats 55/45 as equal (4/4)', () => {
    const d = deriveStkl({ filing: 'married', children: 0, income1: 55_000, income2: 45_000 })
    expect(d.stkl).toBe(4)
  })
})

describe('deriveStkl: never recommends Steuerklasse 6', () => {
  it('does not return 6 across a wide range of inputs', () => {
    const cases = [
      { filing: 'single' as const, children: 0, income1: 80_000, income2: 0 },
      { filing: 'single' as const, children: 3, income1: 30_000, income2: 0 },
      { filing: 'married' as const, children: 0, income1: 200_000, income2: 0 },
      { filing: 'married' as const, children: 4, income1: 50_000, income2: 50_000 },
    ]
    for (const c of cases) {
      const d = deriveStkl(c)
      expect(d.stkl).not.toBe(6)
      expect(d.partnerStkl).not.toBe(6)
    }
  })
})
