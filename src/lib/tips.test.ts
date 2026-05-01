import { describe, it, expect } from 'vitest'
import { PapOptions, calculatePapResultFromRE4 } from './pap'
import { computeTips } from './tips'

const baseOptions: PapOptions = {
  year: 2026,
  filing: 'single',
  children: 0,
  solidarity: false,
  churchRate: 0,
  investmentIncome: 0,
}

function tipsFor(income: number, overrides: PapOptions = {}) {
  const options = { ...baseOptions, ...overrides }
  const result = calculatePapResultFromRE4(income, options)
  return computeTips({ result, options })
}

const ids = (tips: ReturnType<typeof computeTips>) => tips.map((t) => t.id)

describe('tips: saver allowance', () => {
  it('appears when investment income < allowance', () => {
    const t = tipsFor(60_000, { investmentIncome: 200 })
    expect(ids(t)).toContain('saver-allowance')
  })

  it('disappears once allowance is fully used (single = 1000 EUR)', () => {
    const t = tipsFor(60_000, { investmentIncome: 1_000 })
    expect(ids(t)).not.toContain('saver-allowance')
  })

  it('uses 2000 EUR allowance for married filers', () => {
    const tBelow = tipsFor(60_000, { filing: 'married', investmentIncome: 1_500 })
    const tAtCap = tipsFor(60_000, { filing: 'married', investmentIncome: 2_000 })
    expect(ids(tBelow)).toContain('saver-allowance')
    expect(ids(tAtCap)).not.toContain('saver-allowance')
  })
})

describe('tips: marry someone with no income', () => {
  it('appears for high-earning singles with material savings', () => {
    const t = tipsFor(80_000)
    const marry = t.find((tip) => tip.id === 'marry-zero')
    expect(marry).toBeTruthy()
    expect(marry!.savings).toBeGreaterThan(1000)
  })

  it('does not appear for already-married users', () => {
    const t = tipsFor(80_000, { filing: 'married' })
    expect(ids(t)).not.toContain('marry-zero')
  })

  it('does not appear at very low incomes (no real savings)', () => {
    const t = tipsFor(15_000)
    expect(ids(t)).not.toContain('marry-zero')
  })
})

describe('tips: have children', () => {
  it('appears at high incomes with no children', () => {
    const t = tipsFor(120_000)
    const child = t.find((tip) => tip.id === 'have-children')
    expect(child).toBeTruthy()
    expect(child!.savings).toBeGreaterThan(0)
  })

  it('does not appear when the user already has children', () => {
    const t = tipsFor(120_000, { children: 2 })
    expect(ids(t)).not.toContain('have-children')
  })

  it('does not appear at low incomes where Kindergeld already wins', () => {
    const t = tipsFor(35_000)
    expect(ids(t)).not.toContain('have-children')
  })
})

describe('tips: church exit', () => {
  it('appears when church rate is non-zero', () => {
    const t = tipsFor(60_000, { churchRate: 0.09 })
    const church = t.find((tip) => tip.id === 'church-exit')
    expect(church).toBeTruthy()
    expect(church!.savings).toBeGreaterThan(0)
  })

  it('is silent when the user already pays no church tax', () => {
    const t = tipsFor(60_000, { churchRate: 0 })
    expect(ids(t)).not.toContain('church-exit')
  })
})

describe('tips: investment vs salary swap', () => {
  it('appears once marginal salary tax is comfortably above 25% Abgeltungsteuer', () => {
    const t = tipsFor(120_000)
    const swap = t.find((tip) => tip.id === 'invest-vs-salary')
    expect(swap).toBeTruthy()
    expect(swap!.savings).toBeGreaterThan(0)
  })

  it('does not appear at low incomes where marginal salary rate is below 25%', () => {
    const t = tipsFor(20_000)
    expect(ids(t)).not.toContain('invest-vs-salary')
  })
})

describe('tips: absurd Dubai option', () => {
  it('appears once total tax is meaningful', () => {
    const t = tipsFor(80_000)
    expect(ids(t)).toContain('move-dubai')
  })

  it('is silent at very low incomes', () => {
    const t = tipsFor(15_000)
    expect(ids(t)).not.toContain('move-dubai')
  })
})

describe('tips: ordering', () => {
  it('returns serious tips before cheeky, cheeky before absurd', () => {
    const t = tipsFor(120_000, { churchRate: 0.09 })
    const tones = t.map((tip) => tip.tone)
    const lastSerious = tones.lastIndexOf('serious')
    const firstCheeky = tones.indexOf('cheeky')
    const firstAbsurd = tones.indexOf('absurd')
    if (firstCheeky !== -1) expect(firstCheeky).toBeGreaterThan(lastSerious)
    if (firstAbsurd !== -1 && firstCheeky !== -1) expect(firstAbsurd).toBeGreaterThan(firstCheeky)
  })
})
