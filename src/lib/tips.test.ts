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

describe('tips: verbeamtung', () => {
  it('appears for employees above income threshold', () => {
    expect(ids(tipsFor(60_000))).toContain('verbeamtung')
  })

  it('is hidden when beamtenMode is enabled', () => {
    const options = { ...baseOptions }
    const result = calculatePapResultFromRE4(60_000, options)
    const t = computeTips({ result, options, beamtenMode: true })
    expect(ids(t)).not.toContain('verbeamtung')
  })

  it('is silent below threshold', () => {
    expect(ids(tipsFor(40_000))).not.toContain('verbeamtung')
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

describe('tips: Rürup / Basisrente', () => {
  it('appears at incomes where the marginal rate is meaningful', () => {
    const t = tipsFor(80_000)
    const ruerup = t.find((tip) => tip.id === 'ruerup-pension')
    expect(ruerup).toBeTruthy()
    expect(ruerup!.savings).toBeGreaterThan(0)
  })

  it('does not appear at incomes too low for a non-trivial benefit', () => {
    const t = tipsFor(20_000)
    expect(ids(t)).not.toContain('ruerup-pension')
  })

  it('savings scale with marginal rate (higher income → higher saving)', () => {
    const t1 = tipsFor(60_000).find((tip) => tip.id === 'ruerup-pension')!
    const t2 = tipsFor(120_000).find((tip) => tip.id === 'ruerup-pension')!
    expect(t2.savings!).toBeGreaterThan(t1.savings!)
  })
})

describe('tips: charitable donation', () => {
  it('appears with a EUR 1,000 example saving at typical incomes', () => {
    const t = tipsFor(70_000)
    const donation = t.find((tip) => tip.id === 'donation')
    expect(donation).toBeTruthy()
    expect(donation!.savings).toBeGreaterThan(150)
    expect(donation!.savings).toBeLessThan(500)
  })

  it('is silent at low incomes', () => {
    const t = tipsFor(15_000)
    expect(ids(t)).not.toContain('donation')
  })
})

describe('tips: Werbungskosten itemization', () => {
  it('appears at typical incomes with computed savings on EUR 1,000 extra', () => {
    const t = tipsFor(70_000)
    const wk = t.find((tip) => tip.id === 'werbungskosten')
    expect(wk).toBeTruthy()
    expect(wk!.savings).toBeGreaterThan(150)
  })

  it('is silent at low incomes', () => {
    const t = tipsFor(15_000)
    expect(ids(t)).not.toContain('werbungskosten')
  })
})

describe('tips: § 35a Haushaltsnahe & Handwerker', () => {
  it('appears once the user owes meaningful tax', () => {
    const t = tipsFor(50_000)
    expect(ids(t)).toContain('haushalt-handwerker')
  })

  it('is silent when there is no tax to reduce', () => {
    const t = tipsFor(12_000)
    expect(ids(t)).not.toContain('haushalt-handwerker')
  })

  it('is informational (no specific savings number)', () => {
    const t = tipsFor(50_000)
    const tip = t.find((tip) => tip.id === 'haushalt-handwerker')!
    expect(tip.savings).toBeUndefined()
  })
})

describe('tips: splitting benefit for two-earner married couples', () => {
  function tipsForCouple(income1: number, income2: number) {
    const options: PapOptions = { ...baseOptions, filing: 'married' as const }
    const result = calculatePapResultFromRE4(income1 + income2, options)
    return computeTips({ result, options, partner1Income: income1, partner2Income: income2 })
  }

  it('appears when partners earn very different amounts', () => {
    const t = tipsForCouple(120_000, 20_000)
    const splitting = t.find((tip) => tip.id === 'splitting-benefit')
    expect(splitting).toBeTruthy()
    expect(splitting!.savings).toBeGreaterThan(1000)
  })

  it('vanishes when partners earn the same amount (no benefit from splitting)', () => {
    const t = tipsForCouple(60_000, 60_000)
    expect(ids(t)).not.toContain('splitting-benefit')
  })

  it('does not appear for single filers', () => {
    const t = tipsFor(140_000)
    expect(ids(t)).not.toContain('splitting-benefit')
  })

  it('does not appear if one partner has zero income (covered by marry-zero)', () => {
    const t = tipsForCouple(120_000, 0)
    expect(ids(t)).not.toContain('splitting-benefit')
  })
})

describe('tips: JAEG / PKV unlock (cheeky)', () => {
  it('appears for employees below the JAEG on GKV', () => {
    const t = tipsFor(70_000)
    expect(ids(t)).toContain('jaeg-unlock')
  })

  it('is silent once salary clears the JAEG', () => {
    const t = tipsFor(80_000)
    expect(ids(t)).not.toContain('jaeg-unlock')
  })

  it('is silent for PKV employees or Beihilfe', () => {
    expect(ids(tipsFor(70_000, { pkv: 1 }))).not.toContain('jaeg-unlock')
    expect(ids(tipsFor(70_000, { pkv: 2 }))).not.toContain('jaeg-unlock')
  })

  it('uses partner 1 income when married (not household total)', () => {
    const options: PapOptions = { ...baseOptions, filing: 'married' as const }
    const result = calculatePapResultFromRE4(200_000, options)
    const withPartner = computeTips({ result, options, partner1Income: 70_000, partner2Income: 130_000 })
    const withoutPartner = computeTips({ result, options })
    expect(ids(withPartner)).toContain('jaeg-unlock')
    expect(ids(withoutPartner)).not.toContain('jaeg-unlock')
  })

  it('respects a pro-mode JAEG override', () => {
    const t = tipsFor(78_000, { jaeg: 81_000 })
    expect(ids(t)).toContain('jaeg-unlock')
  })
})

describe('tips: BBG sprint (cheeky)', () => {
  it('appears when income is in the last stretch before the RV/AV cap', () => {
    const t = tipsFor(95_000)
    expect(ids(t)).toContain('bbg-sprint')
  })

  it('is silent far below the cap', () => {
    const t = tipsFor(70_000)
    expect(ids(t)).not.toContain('bbg-sprint')
  })

  it('is silent once past the cap', () => {
    const t = tipsFor(110_000)
    expect(ids(t)).not.toContain('bbg-sprint')
  })

  it('uses a pro-mode bbgRvAlv override for the band', () => {
    const t = tipsFor(115_000, { bbgRvAlv: 121_680 })
    expect(ids(t)).toContain('bbg-sprint')
  })
})
