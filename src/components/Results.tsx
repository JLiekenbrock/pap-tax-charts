import React from 'react'
import { PapCalculationResult } from '../lib/pap'
import { actualContributions } from '../lib/rates'
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
  investmentInRates,
  onInvestmentInRatesChange,
}: {
  result: PapCalculationResult
  settings: PapExplorerSettings
  vspInRates: boolean
  onVspInRatesChange: (next: boolean) => void
  vspInComposition: boolean
  onVspInCompositionChange: (next: boolean) => void
  investmentInRates: boolean
  onInvestmentInRatesChange: (next: boolean) => void
}) {
  const socialContributions = actualContributions(result)
  const incomeAfterTax = Math.max(0, result.totalIncome - result.tax)
  const takeHomeCash = Math.max(0, result.totalIncome - result.tax - socialContributions)
  const kindergeld = settings.includeKindergeld ? settings.kindergeldChildren * KINDERGELD_MONTHLY_2026 * 12 : 0

  // Pure tax rate (0 below the Grundfreibetrag/Steueruntergrenze).
  const salaryTaxRate = result.income > 0 ? (result.payrollTax / result.income) * 100 : 0
  const totalTaxRate = result.totalIncome > 0 ? (result.tax / result.totalIncome) * 100 : 0
  // Combined burden including actual social contributions (RV+KV+PV+AV).
  // Even at 0 tax this is non-zero because contributions are still owed.
  const salaryBurdenRate = result.income > 0 ? ((result.payrollTax + socialContributions) / result.income) * 100 : 0
  const totalBurdenRate = result.totalIncome > 0 ? ((result.tax + socialContributions) / result.totalIncome) * 100 : 0

  const rows: Array<[string, string]> = [
    // Tax breakdown — components are kept independent and only shown when
    // they're non-zero so we never display two rows with the same value.
    ['Income tax', eur(result.base)],
    ...(result.investmentTax > 0 ? [['Investment tax', eur(result.investmentTax)] as [string, string]] : []),
    ...(result.solz > 0 ? [['Solidarity surcharge', eur(result.solz)] as [string, string]] : []),
    ...(result.church > 0 ? [['Church tax', eur(result.church)] as [string, string]] : []),
    ['Total tax', eur(result.tax)],
    // Cash flows.
    ['Income after tax', eur(incomeAfterTax)],
    ['Social contributions', eur(socialContributions)],
    ['Take-home cash', eur(takeHomeCash)],
    ...(settings.includeKindergeld ? [
      ['Kindergeld', eur(kindergeld)] as [string, string],
      ['Take-home incl. Kindergeld', eur(takeHomeCash + kindergeld)] as [string, string],
    ] : []),
    // Rates.
    ['Effective tax on salary', `${salaryTaxRate.toFixed(2)}%`],
    ...(vspInRates ? [
      ['Effective burden (tax + VSP) on salary', `${salaryBurdenRate.toFixed(2)}%`] as [string, string],
    ] : []),
    ...(result.investmentIncome > 0 ? [
      ['Effective tax on total income', `${totalTaxRate.toFixed(2)}%`] as [string, string],
      ...(vspInRates ? [
        ['Effective burden (tax + VSP) on total income', `${totalBurdenRate.toFixed(2)}%`] as [string, string],
      ] : []),
    ] : []),
    // Inputs / supporting values.
    ...(settings.filing === 'married' ? [
      ['Income 1', eur(settings.income1)] as [string, string],
      ['Income 2', eur(settings.income2)] as [string, string],
    ] : []),
    ...(result.investmentIncome > 0 ? [
      ['Investment income', eur(result.investmentIncome)] as [string, string],
      ['Saver allowance', eur(result.saverAllowance)] as [string, string],
      ['Investment taxable', eur(result.investmentTaxable)] as [string, string],
    ] : []),
    ['Taxable income / ZVE', eur(result.zve)],
    ['ZTABFB', eur(result.ztabfb)],
    ['VSP (deductible)', eur(result.vsp)],
    ['Pension part', eur(result.vspRenten)],
    ['Health/care part', eur(result.vspKrankenPflege)],
    ['Unemployment part', eur(result.vspArbeitslosen)],
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
      <label className="checkbox-row result-toggle">
        <input
          type="checkbox"
          checked={investmentInRates}
          onChange={(event) => onInvestmentInRatesChange(event.target.checked)}
        />
        Include capital gains in tax rates
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
