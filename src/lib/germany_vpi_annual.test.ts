import { describe, expect, it } from 'vitest'
import { nominalEuroFromRealEuro, realEuroFromNominalEuro, vpiDeutschlandJahresmittel } from './germany_vpi_annual'
import {
  explorerNominalWageEUR,
  explorerSettingsAfterRealIncomeToggle,
  explorerStoredWageFromNominalEUR,
} from './explorer_real_income'
import type { PapExplorerSettings } from '../components/TaxInput'

describe('vpiDeutschlandJahresmittel', () => {
  it('anchors 2021 and 2025 published JD values', () => {
    expect(vpiDeutschlandJahresmittel(2021)).toBe(103.1)
    expect(vpiDeutschlandJahresmittel(2025)).toBe(121.9)
  })
})

describe('nominal / real EUR round-trip', () => {
  const ex: Pick<PapExplorerSettings, 'realIncomeMode' | 'realIncomeBaseYear'> = {
    realIncomeMode: true,
    realIncomeBaseYear: 2021,
  }

  it('round-trips 50 000 Konstant‑EUR for 2026 tariff year via explorer helpers', () => {
    const k = 50_000
    const n = explorerNominalWageEUR(k, 2026, ex)
    expect(n).toBeGreaterThan(k)
    const back = explorerStoredWageFromNominalEUR(n, 2026, ex)
    expect(back).toBe(k)
  })

  it('identity when realIncomeMode off', () => {
    const off = { ...ex, realIncomeMode: false }
    expect(explorerNominalWageEUR(60_000, 2026, off)).toBe(60_000)
    expect(explorerStoredWageFromNominalEUR(60_000, 2026, off)).toBe(60_000)
  })

  it('nominalEuroFromRealEuro agrees with chained ratio across years', () => {
    const real = 48_888
    const n2025 = nominalEuroFromRealEuro(real, 2025, 2021)
    expect(realEuroFromNominalEuro(n2025, 2025, 2021)).toBe(real)
  })

  it('toggle helper round-trips nominal off → on → off for single earner', () => {
    const base: PapExplorerSettings = {
      income: 72_000,
      income1: 72_000,
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
      solidarity: false,
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
      realIncomeMode: false,
      realIncomeBaseYear: 2021,
      proMode: false,
      beamtenMode: false,
    }
    const on = explorerSettingsAfterRealIncomeToggle(true, base)
    expect(on.realIncomeMode).toBe(true)
    const reconNominal = explorerNominalWageEUR(on.income, on.year, on)
    expect(Math.abs(reconNominal - base.income)).toBeLessThanOrEqual(1)
    const off = explorerSettingsAfterRealIncomeToggle(false, on)
    expect(off.realIncomeMode).toBe(false)
    expect(Math.abs(off.income - base.income)).toBeLessThanOrEqual(1)
  })
})
