import React from 'react'
import { PapCalculationResult } from '../lib/pap'
import { PapExplorerSettings } from './TaxInput'

function eur(value: number) {
  return `EUR ${Math.round(value).toLocaleString()}`
}

const KINDERGELD_MONTHLY_2026 = 259

export default function Results({ result, settings }: { result: PapCalculationResult; settings: PapExplorerSettings }) {
  const [includeVsp, setIncludeVsp] = React.useState(false)
  const netSalary = Math.max(0, result.income - result.tax - result.vsp)
  const kindergeld = settings.includeKindergeld ? settings.kindergeldChildren * KINDERGELD_MONTHLY_2026 * 12 : 0
  const netWithKindergeld = netSalary + kindergeld
  const effectiveBase = includeVsp ? result.tax + result.vsp : result.tax
  const effective = result.income > 0 ? (effectiveBase / result.income) * 100 : 0

  const rows = [
    ['Tax', eur(result.tax)],
    ['Net salary', eur(netSalary)],
    ...(settings.includeKindergeld ? [
      ['Kindergeld', eur(kindergeld)],
      ['Net incl. Kindergeld', eur(netWithKindergeld)],
    ] : []),
    [includeVsp ? 'Tax + VSP share' : 'Effective tax rate', `${effective.toFixed(2)}%`],
    ...(settings.filing === 'married' ? [
      ['Income 1', eur(settings.income1)],
      ['Income 2', eur(settings.income2)],
    ] : []),
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
        <input type="checkbox" checked={includeVsp} onChange={(event) => setIncludeVsp(event.target.checked)} />
        Include VSP in share
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
