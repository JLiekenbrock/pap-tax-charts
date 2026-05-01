import React from 'react'
import { PapCalculationResult } from '../lib/pap'

function eur(value: number) {
  return `EUR ${Math.round(value).toLocaleString()}`
}

export default function Results({ result }: { result: PapCalculationResult }) {
  const effective = result.income > 0 ? (result.tax / result.income) * 100 : 0

  const rows = [
    ['Tax', eur(result.tax)],
    ['Effective rate', `${effective.toFixed(2)}%`],
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
