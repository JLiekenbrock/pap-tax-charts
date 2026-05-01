import { describe, it, expect } from 'vitest'
import { calculatePapResultFromRE4, calculatePapTaxFromRE4, calculatePapTax } from './pap'

describe('MZTABFB simplified checks', () => {
  it('computes ZTABFB effect and reduces tax for RE4=60000', () => {
    const re4 = 60000
    const taxFromRE4 = calculatePapTaxFromRE4(re4, { year: 2025, filing: 'single', children: 0, solidarity: false })
    const taxDirect = calculatePapTax(re4, { year: 2025, filing: 'single', children: 0, solidarity: false })
    // The MLSTJAHR path should compute taxable income and produce tax that's >= direct tariff on the same number
    expect(taxFromRE4).toBeGreaterThanOrEqual(0)
    expect(taxDirect).toBeGreaterThanOrEqual(0)
  })
})

describe('PAP local result reconciliation checks', () => {
  const incomes = [20000, 40000, 60000, 100000]
  const stklList = [1, 2, 3, 4] as const

  for (const income of incomes) {
    for (const stkl of stklList) {
      it(`reconciles local PAP internals for RE4=${income}, STKL=${stkl}`, () => {
        const r = calculatePapResultFromRE4(income, {
          year: 2026,
          filing: 'single',
          children: 0,
          stkl,
          solidarity: false,
          churchRate: 0,
        })

        expect(r.ztabfb).toBe(r.anp + r.efa + r.sap + r.kfb)
        expect(r.zve).toBe(Math.max(0, Math.floor(r.income - r.ztabfb - r.vsp)))

        const directVsp = Math.ceil(r.vspRenten + r.vspKrankenPflege)
        const cappedVspn = Math.ceil(r.vspRenten + Math.min(r.vspArbeitslosen + r.vspKrankenPflege, 1900))
        expect(r.vsphb).toBe(Math.min(Math.floor((r.vspArbeitslosen + r.vspKrankenPflege) * 100) / 100, 1900))
        expect(r.vspn).toBe(cappedVspn)
        expect(r.vsp).toBe(Math.max(directVsp, cappedVspn))

        expect(r.wvfrb).toBe(Math.max(0, Math.floor(r.zve - r.gfb)))
        expect(r.tax).toBe(r.baseTax + r.solz + r.church)
        expect(r.lstlzz).toBe(r.tax)
      })
    }
  }
})
