import { describe, expect, it } from 'vitest'
import type { PapExplorerSettings } from '../components/TaxInput'
import {
  computePercentileTaxContributionByDecile,
  computePercentileTaxContributionByRank,
} from './percentile_tax_contribution'

const minimalExplorer = (partial: Partial<PapExplorerSettings> = {}): PapExplorerSettings =>
  ({
    income: 50_000,
    income1: 50_000,
    income2: 0,
    investmentIncome: 0,
    includeKindergeld: false,
    kindergeldChildren: 0,
    rangeMin: 0,
    rangeMax: 120_000,
    year: 2026,
    filing: 'single',
    stkl: 3,
    children: 2,
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
    realIncomeMode: false,
    realIncomeBaseYear: 2021,
    beamtenMode: false,
    ...partial,
  }) as PapExplorerSettings

describe('computePercentileTaxContributionByRank', () => {
  it('has 99 ranks and per-rank shares sum to ~100%', () => {
    const { ranks, totalTaxEUR } = computePercentileTaxContributionByRank(minimalExplorer(), 'payrollTax')
    expect(ranks).toHaveLength(99)
    expect(ranks[0]!.p).toBe(1)
    expect(ranks[98]!.p).toBe(99)
    expect(totalTaxEUR).toBeGreaterThan(0)
    const s = ranks.reduce((a, b) => a + b.shareOfTotal, 0)
    expect(s).toBeCloseTo(1, 5)
  })
})

describe('computePercentileTaxContributionByDecile', () => {
  it('decile shares sum to ~100% when total mass is positive', () => {
    const { buckets, totalTaxEUR } = computePercentileTaxContributionByDecile(
      minimalExplorer(),
      'taxPlusEmployeeSocial',
    )
    expect(totalTaxEUR).toBeGreaterThan(0)
    const s = buckets.reduce((a, b) => a + b.shareOfTotal, 0)
    expect(s).toBeCloseTo(1, 5)
    expect(buckets).toHaveLength(10)
  })

  it('uses neutral ladder filing (canonical) so marital fields on explorer slice do not change mass', () => {
    const a = computePercentileTaxContributionByDecile(minimalExplorer({ filing: 'married', income1: 80_000, income2: 20_000 }), 'payrollTax')
    const b = computePercentileTaxContributionByDecile(minimalExplorer({ filing: 'single', income: 55_555 }), 'payrollTax')
    expect(a.totalTaxEUR).toBe(b.totalTaxEUR)
  })

  it('top wage decile has strictly higher aggregate payroll tax mass than bottom decile under default GKV baseline', () => {
    const { buckets } = computePercentileTaxContributionByDecile(minimalExplorer(), 'payrollTax')
    expect(buckets[buckets.length - 1]!.sumTaxEUR).toBeGreaterThan(buckets[0]!.sumTaxEUR)
  })
})
