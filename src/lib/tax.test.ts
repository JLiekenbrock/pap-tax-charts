import { describe, it, expect } from 'vitest'
import { calculateTax } from './tax'

describe('calculateTax', () => {
  it('returns 0 below exemption', () => {
    expect(calculateTax(0)).toBe(0)
    expect(calculateTax(10000)).toBe(0)
  })

  it('increases with income', () => {
    const a = calculateTax(20000)
    const b = calculateTax(40000)
    expect(b).toBeGreaterThan(a)
  })

  it('uses higher rate for very high incomes', () => {
    const mid = calculateTax(100000)
    const high = calculateTax(400000)
    expect(high).toBeGreaterThan(mid * 2)
  })
})
