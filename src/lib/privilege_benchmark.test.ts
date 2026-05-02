import { describe, expect, it } from 'vitest'
import {
  DESTATIS_CHART_INCOME_RUG_MARKERS_2024,
  crossBandModelLadder,
  crossBandWeightedEmployeeSocialRef,
  employeeSocialPercentOnSalary,
  grossAtDeStatisPercentile,
  individualIncomePercentileDeStatis,
  taxOutcomeBandFromBurdens,
  totalBurdenPercentOnIncome,
  wageBurdenPercentOnSalary,
  ladderEvaluationGrossForDestatisBracket,
  MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR,
  computePrivilegeSnapshot,
  householdGrossForDestatisBracket,
  privilegeLadderPapOpts,
  representativeGrossForDestatisBracket,
  payrollTaxPctPercentileVersusDestatisWageSpline,
} from './privilege_benchmark'
import {
  DESTATIS_INCOME_TAX_BRACKETS_2021,
  destatisIncomeTaxBracketForApproxEinkommen,
  formatDestatisBracketLabel,
} from './destatis_income_tax_brackets_2021'
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

  it('round-trips interpolated mid-decile percentile via gross↔pct splines', () => {
    const p = 73.7
    const eur = grossAtDeStatisPercentile(p)
    const back = individualIncomePercentileDeStatis(eur)
    expect(back).toBeCloseTo(p, 0)
  })
})

describe('Destatis chart rug markers', () => {
  it('uses only officially tabulated percentile points (no synthetic p91–p98 rugs)', () => {
    expect(DESTATIS_CHART_INCOME_RUG_MARKERS_2024.length).toBe(10)
    expect(DESTATIS_CHART_INCOME_RUG_MARKERS_2024.map((m) => m.p)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 99,
    ])
    expect(DESTATIS_CHART_INCOME_RUG_MARKERS_2024.find((m) => m.p === 90)!.eur).toBe(97_680)
    expect(DESTATIS_CHART_INCOME_RUG_MARKERS_2024.find((m) => m.p === 99)!.eur).toBe(213_286)
    expect(DESTATIS_CHART_INCOME_RUG_MARKERS_2024.find((m) => m.p === 95)).toBeUndefined()
  })
})

describe('payrollTaxPctPercentileVersusDestatisWageSpline', () => {
  it('returns null without wage income', () => {
    const s: PapExplorerSettings = { ...baseExplorer, income: 0 }
    const r = calculatePapResultFromRE4(0, s)
    expect(payrollTaxPctPercentileVersusDestatisWageSpline(s, r)).toBeNull()
  })

  it('lands near middle of spline at median-ish gross defaults', () => {
    const s = baseExplorer
    const r = calculatePapResultFromRE4(s.income, s)
    const pTax = payrollTaxPctPercentileVersusDestatisWageSpline(s, r)!
    expect(pTax).toBeGreaterThan(30)
    expect(pTax).toBeLessThan(70)
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
    expect(['winner', 'typical', 'loser']).toContain(snap.bandIntra)
    expect(['winner', 'typical', 'loser']).toContain(snap.bandAcross)
    expect(['winner', 'typical', 'loser']).toContain(snap.bandAcrossFull)
    expect(snap.payrollTaxPctPercentileVersusFtWageSpline).not.toBeNull()
    expect(snap.payrollTaxPctPercentileVersusFtWageSpline!).toBeGreaterThanOrEqual(0)
    expect(snap.payrollTaxPctPercentileVersusFtWageSpline!).toBeLessThanOrEqual(100)
  })
})

describe('across-band social ladder (model)', () => {
  it('employee social % falls from low to top anchor under GKV defaults', () => {
    const first = DESTATIS_INCOME_TAX_BRACKETS_2021[0]!
    const last = DESTATIS_INCOME_TAX_BRACKETS_2021[DESTATIS_INCOME_TAX_BRACKETS_2021.length - 1]!
    const g0 = ladderEvaluationGrossForDestatisBracket(first).evaluationGrossEur
    const g1 = ladderEvaluationGrossForDestatisBracket(last).evaluationGrossEur
    const r0 = calculatePapResultFromRE4(g0, baseExplorer)
    const r1 = calculatePapResultFromRE4(g1, baseExplorer)
    expect(employeeSocialPercentOnSalary(r0)).toBeGreaterThan(employeeSocialPercentOnSalary(r1))
  })

  it('mass-weighted social ref lies inside anchor min/max', () => {
    const { weightedRefPct, rows } = crossBandWeightedEmployeeSocialRef(baseExplorer)
    const pcts = rows.map((row) => row.socialPct)
    expect(weightedRefPct).toBeGreaterThanOrEqual(Math.min(...pcts) - 1e-9)
    expect(weightedRefPct).toBeLessThanOrEqual(Math.max(...pcts) + 1e-9)
  })

  it('mass-weighted wage-burden ref lies inside anchor min/max', () => {
    const { weightedWageBurdenRefPct, weightedSocialRefPct, rows } = crossBandModelLadder(baseExplorer)
    const pcts = rows.map((row) => row.wageBurdenPct)
    expect(weightedWageBurdenRefPct).toBeGreaterThanOrEqual(Math.min(...pcts) - 1e-9)
    expect(weightedWageBurdenRefPct).toBeLessThanOrEqual(Math.max(...pcts) + 1e-9)
    expect(weightedWageBurdenRefPct).toBeGreaterThan(weightedSocialRefPct)
  })

  it('wage burden % is social + payroll components on salary', () => {
    const r = calculatePapResultFromRE4(55_000, baseExplorer)
    const wb = wageBurdenPercentOnSalary(r)
    expect(wb).toBeCloseTo(employeeSocialPercentOnSalary(r) + (r.payrollTax / r.income) * 100, 5)
  })

  it('matches deprecated social-only helper ref', () => {
    const a = crossBandModelLadder(baseExplorer)
    const b = crossBandWeightedEmployeeSocialRef(baseExplorer)
    expect(a.weightedSocialRefPct).toBeCloseTo(b.weightedRefPct, 8)
  })

  it('mass-weighted ladder refs do not depend on filing or STKL (canonical anchors)', () => {
    const married: PapExplorerSettings = {
      ...baseExplorer,
      filing: 'married',
      stkl: 3,
      children: 2,
      income1: 50_000,
      income2: 40_000,
      income: 50_000,
    }
    const neutral: PapExplorerSettings = { ...baseExplorer, filing: 'single', stkl: 1, children: 0, income: 90_000 }
    const a = crossBandModelLadder(married)
    const b = crossBandModelLadder(neutral)
    expect(a.weightedWageBurdenRefPct).toBeCloseTo(b.weightedWageBurdenRefPct, 8)
    expect(a.weightedSocialRefPct).toBeCloseTo(b.weightedSocialRefPct, 8)
    expect(neutral.investmentIncome).toBe(married.investmentIncome)
  })

  it('ladder ref is identical when only filing, STKL, children, and income layout differ (same fiscal inputs)', () => {
    const core = {
      ...baseExplorer,
      year: 2026,
      solidarity: true,
      churchRate: 0,
      kvz: 1.7,
      investmentIncome: 5_000,
      income1: 45_000,
      income2: 35_000,
      income: 80_000,
    }
    const married: PapExplorerSettings = {
      ...core,
      filing: 'married',
      stkl: 4,
      children: 2,
    }
    const single: PapExplorerSettings = {
      ...core,
      filing: 'single',
      stkl: 1,
      children: 0,
    }
    const a = crossBandModelLadder(married)
    const b = crossBandModelLadder(single)
    expect(a.weightedWageBurdenRefPct).toBeCloseTo(b.weightedWageBurdenRefPct, 10)
    expect(a.weightedSocialRefPct).toBeCloseTo(b.weightedSocialRefPct, 10)
  })

  it('ladder applies minimum evaluation gross and keeps social % below 100%', () => {
    const { rows } = crossBandModelLadder(baseExplorer)
    for (const row of rows) {
      expect(row.anchorGross).toBeGreaterThanOrEqual(MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR)
      expect(row.socialPct).toBeLessThan(100)
      expect(row.wageBurdenPct).toBeLessThan(100)
      expect(row.nominalMidpointEur).toBeGreaterThanOrEqual(0)
    }
    const lowBand = DESTATIS_INCOME_TAX_BRACKETS_2021[0]!
    const lowRow = rows.find((r) => r.bracketLabel === formatDestatisBracketLabel(lowBand))!
    expect(lowRow.nominalMidpointEur).toBe(2_500)
    expect(lowRow.anchorGross).toBe(MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR)
    const b02 = DESTATIS_INCOME_TAX_BRACKETS_2021[1]!
    expect(ladderEvaluationGrossForDestatisBracket(b02).usedMinimumEvaluationFloor).toBe(true)
    const bMid = DESTATIS_INCOME_TAX_BRACKETS_2021[10]!
    expect(ladderEvaluationGrossForDestatisBracket(bMid).usedMinimumEvaluationFloor).toBe(false)
  })

  it('ladder last column matches total burden at anchor when investment income set', () => {
    const withInv: PapExplorerSettings = { ...baseExplorer, investmentIncome: 15_000 }
    const b = DESTATIS_INCOME_TAX_BRACKETS_2021[10]!
    const anchor = ladderEvaluationGrossForDestatisBracket(b).evaluationGrossEur
    const r = calculatePapResultFromRE4(anchor, privilegeLadderPapOpts(withInv))
    const row = crossBandModelLadder(withInv).rows.find((x) => x.bracketLabel === formatDestatisBracketLabel(b))!
    expect(row.wageBurdenPct).toBeCloseTo(totalBurdenPercentOnIncome(r), 5)
    const rNoInv = calculatePapResultFromRE4(anchor, privilegeLadderPapOpts(withInv, { investmentIncome: 0 }))
    expect(totalBurdenPercentOnIncome(r)).not.toBe(totalBurdenPercentOnIncome(rNoInv))
  })

  it('marks current bracket in ladder rows', () => {
    const s: PapExplorerSettings = { ...baseExplorer, income: 55_000, income1: 55_000 }
    const { rows } = crossBandModelLadder(s)
    const here = rows.filter((row) => row.isYourBracket)
    expect(here).toHaveLength(1)
    expect(here[0]!.bracketLabel).toContain('50')
  })
})
