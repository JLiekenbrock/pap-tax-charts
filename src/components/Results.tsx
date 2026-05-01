import React from 'react'
import { PapCalculationResult } from '../lib/pap'

function eur(value: number) {
  return `EUR ${Math.round(value).toLocaleString()}`
}

export default function Results({ result }: { result: PapCalculationResult }) {
  const [includeVsp, setIncludeVsp] = React.useState(false)
  const effectiveBase = includeVsp ? result.tax + result.vsp : result.tax
  const effective = result.income > 0 ? (effectiveBase / result.income) * 100 : 0

  const rows = [
    ['Tax', eur(result.tax)],
    [includeVsp ? 'Tax + VSP share' : 'Effective tax rate', `${effective.toFixed(2)}%`],
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
