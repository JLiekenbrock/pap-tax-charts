import { describe, expect, it } from 'vitest'
import { DESTATIS_INCOME_TAX_BRACKETS_2021 } from './destatis_income_tax_brackets_2021'
import {
  assessedIncomeTaxMassThousandEur,
  computeDestatisAdjustedGrossMassWeightedPapContribution,
  computeDestatisOfficialAssessedIncomeTaxMassShares,
  officialAssessedIncomeTaxMassShareSumLoMin,
  midpointAdjustedGrossEurForDestatisBracket,
} from './destatis_mass_tax_contribution'

describe('official assessed income-tax mass reconstruction', () => {
  it('band tax mass scales income aggregate by empirical IT %', () => {
    const b = DESTATIS_INCOME_TAX_BRACKETS_2021[10]!
    expect(assessedIncomeTaxMassThousandEur(b)).toBeCloseTo(
      (b.adjustedGrossIncomeMassThousandEur * b.empiricalAssessedIncomeTaxPct) / 100,
      4,
    )
  })

  it('band shares sum to 1', () => {
    const { bands, totalAssessedIncomeTaxMassThousandEur } = computeDestatisOfficialAssessedIncomeTaxMassShares()
    expect(totalAssessedIncomeTaxMassThousandEur).toBeGreaterThan(0)
    const s = bands.reduce((a, b) => a + b.shareOfOfficialAssessedIncomeTaxMass, 0)
    expect(s).toBeCloseTo(1, 8)
    const RAW_TAX_SUM =
      388_099 + 483_628 + 1_021_645 + 2_920_989 + 4_993_263 + 7_430_891 + 9_963_954 + 12_127_197
      + 12_996_609 + 12_881_294 + 24_697_749 + 22_473_103 + 85_981_831 + 68_248_810 + 34_853_749
      + 19_665_687 + 35_461_945
    expect(totalAssessedIncomeTaxMassThousandEur).toBeCloseTo(RAW_TAX_SUM, 6)
  })

  it('lo-min cumulative helper is monotone for higher cutoffs', () => {
    const a = officialAssessedIncomeTaxMassShareSumLoMin(0)
    const b = officialAssessedIncomeTaxMassShareSumLoMin(125_000)
    const c = officialAssessedIncomeTaxMassShareSumLoMin(500_000)
    expect(a).toBeGreaterThanOrEqual(b)
    expect(b).toBeGreaterThanOrEqual(c)
    expect(a).toBeCloseTo(1, 5)
    expect(b).toBeGreaterThan(0.15)
    expect(b).toBeLessThan(a)
  })
})

describe('Destatis midpoint helper', () => {
  it('bounded interval uses arithmetic mean', () => {
    expect(midpointAdjustedGrossEurForDestatisBracket(50_000, 60_000)).toBe(55_000)
  })
})

describe('mass-weighted Pap shares', () => {
  const explorer = {
    income: 60_000,
    income1: 60_000,
    income2: 0,
    investmentIncome: 0,
    includeKindergeld: false,
    kindergeldChildren: 0,
    rangeMin: 0,
    rangeMax: 120_000,
    year: 2026 as const,
    filing: 'single' as const,
    stkl: 1,
    children: 0,
    solidarity: false,
    churchRate: 0,
    kvz: 0,
    pvs: 0,
    pvz: 0,
    pva: 0,
    krv: 9,
    alv: 1,
    pkv: 0,
    pkpv: 0,
    pkpvagz: 0,
    proMode: false,
    beamtenMode: false,
  }

  it('sums to ~100% weighted tax scaled units', () => {
    const { bands, totalWeightedTaxEURScaled } = computeDestatisAdjustedGrossMassWeightedPapContribution(
      explorer,
      'payrollTax',
    )
    expect(totalWeightedTaxEURScaled).toBeGreaterThan(0)
    expect(bands).toHaveLength(DESTATIS_INCOME_TAX_BRACKETS_2021.length)
    const s = bands.reduce((a, row) => a + row.shareOfTotalWeightedTaxEURScaled, 0)
    expect(s).toBeCloseTo(1, 8)
  })
})
