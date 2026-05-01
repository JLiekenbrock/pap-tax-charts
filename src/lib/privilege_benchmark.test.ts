import { describe, expect, it } from 'vitest'
import {
  grossAtDeStatisPercentile,
  individualIncomePercentileDeStatis,
  taxOutcomeBandFromBurdens,
  computePrivilegeSnapshot,
  householdGrossForDestatisBracket,
} from './privilege_benchmark'
import { destatisIncomeTaxBracketForApproxEinkommen } from './destatis_income_tax_brackets_2021'
import { calculatePapResultFromRE4 } from './pap'
import type { PapExplorerSettings } from '../components/TaxInput'

const baseExplorer: PapExplorerSettings = {
  income: 52_159,
  income1: 52_159,
  income2: 0,
  investmentIncome: 0,
  includeKindergeld: false,
  kindergeldChildren: 0,
  rangeMin: 0,
  rangeMax: 120_000,
  year: 2026,
  filing: 'single',
  stkl: 1,
  children: 0,
  solidarity: true,
  churchRate: 0,
  kvz: 0,
  pvs: 0,
  pvz: 0,
  pva: 0,
  krv: 0,
  alv: 0,
  pkv: 0,
  pkpv: 0,
  pkpvagz: 0,
  proMode: false,
  beamtenMode: false,
}

describe('Destatis income ladder', () => {
  it('round-trips near the published median', () => {
    expect(grossAtDeStatisPercentile(50)).toBe(52_159)
    const pBack = individualIncomePercentileDeStatis(52_159)
    expect(pBack).toBeGreaterThan(49)
    expect(pBack).toBeLessThan(51)
  })

  it('maps P10 cutoff to ~10th percentile', () => {
    expect(individualIncomePercentileDeStatis(32_526)).toBeCloseTo(10, 5)
  })
})

describe('taxOutcomeBandFromBurdens', () => {
  it('classifies vs reference with tolerance', () => {
    expect(taxOutcomeBandFromBurdens(20, 40, 1.5)).toBe('winner')
    expect(taxOutcomeBandFromBurdens(42, 40, 1.5)).toBe('loser')
    expect(taxOutcomeBandFromBurdens(40, 40, 1.5)).toBe('typical')
    expect(taxOutcomeBandFromBurdens(40.5, 40, 1.5)).toBe('typical')
  })
})

describe('computePrivilegeSnapshot (bracket peers)', () => {
  it('uses household sum for married placement', () => {
    const s: PapExplorerSettings = {
      ...baseExplorer,
      filing: 'married',
      income: 110_000,
      income1: 60_000,
      income2: 50_000,
    }
    expect(householdGrossForDestatisBracket(s)).toBe(110_000)
    expect(destatisIncomeTaxBracketForApproxEinkommen(110_000)?.lo).toBe(70_000)
  })

  it('returns payroll and bracket peer rate', () => {
    const s: PapExplorerSettings = { ...baseExplorer, income: 55_000, income1: 55_000 }
    const r = calculatePapResultFromRE4(s.income, s)
    const snap = computePrivilegeSnapshot(s, r)
    expect(snap.yourPayrollIncomeTaxPct).toBeGreaterThan(0)
    expect(snap.bracketPeerAssessedIncomeTaxPct).not.toBeNull()
    expect(snap.destatisBracketLabel).toContain('50')
  })
})
