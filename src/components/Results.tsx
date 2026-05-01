import React from 'react'
import { PapCalculationResult } from '../lib/pap'
import { PapExplorerSettings } from './TaxInput'

function eur(value: number) {
  return `EUR ${Math.round(value).toLocaleString()}`
}

const KINDERGELD_MONTHLY_2026 = 259

export default function Results({
  result,
  settings,
  vspInRates,
  onVspInRatesChange,
  vspInComposition,
  onVspInCompositionChange,
}: {
  result: PapCalculationResult
  settings: PapExplorerSettings
  vspInRates: boolean
  onVspInRatesChange: (next: boolean) => void
  vspInComposition: boolean
  onVspInCompositionChange: (next: boolean) => void
}) {
  const incomeAfterTax = Math.max(0, result.totalIncome - result.tax)
  const takeHomeCash = Math.max(0, result.totalIncome - result.tax - result.vsp)
  const kindergeld = settings.includeKindergeld ? settings.kindergeldChildren * KINDERGELD_MONTHLY_2026 * 12 : 0
  const investmentTaxTotal = result.investmentTax + result.investmentSolz + result.investmentChurch

  // Pure tax rate (0 below the Grundfreibetrag/Steueruntergrenze).
  const salaryTaxRate = result.income > 0 ? (result.payrollTax / result.income) * 100 : 0
  const totalTaxRate = result.totalIncome > 0 ? (result.tax / result.totalIncome) * 100 : 0
  // Combined burden including VSP (social contributions). Even at 0 tax this
  // is non-zero because VSP is still owed.
  const salaryBurdenRate = result.income > 0 ? ((result.payrollTax + result.vsp) / result.income) * 100 : 0
  const totalBurdenRate = result.totalIncome > 0 ? ((result.tax + result.vsp) / result.totalIncome) * 100 : 0

  const rows = [
    ['Tax', eur(result.tax)],
    ['Payroll tax', eur(result.payrollTax)],
    ['Investment tax', eur(investmentTaxTotal)],
    ['Income after tax', eur(incomeAfterTax)],
    ['Take-home cash (after tax & VSP)', eur(takeHomeCash)],
    ...(settings.includeKindergeld ? [
      ['Kindergeld', eur(kindergeld)],
      ['Take-home incl. Kindergeld', eur(takeHomeCash + kindergeld)],
    ] : []),
    ['Effective tax on salary', `${salaryTaxRate.toFixed(2)}%`],
    ...(vspInRates ? [
      ['Effective burden (tax + VSP) on salary', `${salaryBurdenRate.toFixed(2)}%`],
    ] : []),
    ...(result.investmentIncome > 0 ? [
      ['Effective tax on total income', `${totalTaxRate.toFixed(2)}%`],
      ...(vspInRates ? [
        ['Effective burden (tax + VSP) on total income', `${totalBurdenRate.toFixed(2)}%`],
      ] : []),
    ] : []),
    ...(settings.filing === 'married' ? [
      ['Income 1', eur(settings.income1)],
      ['Income 2', eur(settings.income2)],
    ] : []),
    ['Investment income', eur(result.investmentIncome)],
    ['Saver allowance', eur(result.saverAllowance)],
    ['Investment taxable', eur(result.investmentTaxable)],
    ['Taxable income / ZVE', eur(result.zve)],
    ['ZTABFB', eur(result.ztabfb)],
    ['VSP', eur(result.vsp)],
    ['Pension part', eur(result.vspRenten)],
    ['Health/care part', eur(result.vspKrankenPflege)],
    ['Base tax', eur(result.baseTax)],
  ]

  return (
    <aside className="results-panel">
      <h2>Selected result</h2>
      <div className="result-kpi">
        <span>{eur(result.income)}</span>
        <strong>{eur(result.tax)}</strong>
      </div>
      <label className="checkbox-row result-toggle">
        <input
          type="checkbox"
          checked={vspInRates}
          onChange={(event) => onVspInRatesChange(event.target.checked)}
        />
        Include VSP in tax rates
      </label>
      <label className="checkbox-row result-toggle">
        <input
          type="checkbox"
          checked={vspInComposition}
          onChange={(event) => onVspInCompositionChange(event.target.checked)}
        />
        Include VSP in stacked composition
      </label>
      <dl>
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </aside>
  )
}
