import { describe, expect, it } from 'vitest'
import { createIncomePercentileRugsPlugin } from './chart_income_percentile_rugs'
import { individualIncomePercentileDeStatis } from './privilege_benchmark'

describe('createIncomePercentileRugsPlugin', () => {
  it('builds with optional xFromIncomeEur (percentile-mapped x)', () => {
    const p = createIncomePercentileRugsPlugin({
      enabled: false,
      clipXMinEur: 0,
      clipXMaxEur: 200_000,
      markers: [{ p: 50, eur: 52_159 }],
      categoryIncomes: null,
      xFromIncomeEur: individualIncomePercentileDeStatis,
    })
    expect(p.id).toBe('incomePercentileRugs')
  })
})
