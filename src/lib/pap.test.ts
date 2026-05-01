import { describe, it, expect } from 'vitest'
import { calculatePapTax } from './pap'

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
