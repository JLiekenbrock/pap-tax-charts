import React from 'react'
import { ChartMetric, ChartMode, CHART_METRICS } from './TaxChart'
import { PapOptions } from '../lib/pap'

export type PapExplorerSettings = Required<PapOptions> & {
  income: number
  rangeMin: number
  rangeMax: number
  points: number
}

type Props = {
  settings: PapExplorerSettings
  onChange: (next: PapExplorerSettings) => void
  metrics: ChartMetric[]
  onMetricsChange: (next: ChartMetric[]) => void
  chartMode: ChartMode
  onChartModeChange: (next: ChartMode) => void
}

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function TaxInput({ settings, onChange, metrics, onMetricsChange, chartMode, onChartModeChange }: Props) {
  const update = <K extends keyof PapExplorerSettings>(key: K, value: PapExplorerSettings[K]) => {
    onChange({ ...settings, [key]: value })
  }

  const toggleMetric = (metric: ChartMetric) => {
    if (metrics.includes(metric)) {
      const next = metrics.filter((item) => item !== metric)
      onMetricsChange(next.length ? next : ['tax'])
    } else {
      onMetricsChange([...metrics, metric])
    }
  }

  return (
    <aside className="control-panel">
      <div className="control-section">
        <h2>Range</h2>
        <label>
          Income
          <input type="number" value={settings.income} min={0} step={1000} onChange={(e) => update('income', numberValue(e.target.value))} />
        </label>
        <input
          className="income-slider"
          type="range"
          aria-label="Income slider"
          value={settings.income}
          min={settings.rangeMin}
          max={settings.rangeMax}
          step={100}
          onInput={(e) => update('income', numberValue(e.currentTarget.value))}
          onChange={(e) => update('income', numberValue(e.target.value))}
        />
        <div className="two-col">
          <label>
            Min
            <input type="number" value={settings.rangeMin} min={0} step={1000} onChange={(e) => update('rangeMin', numberValue(e.target.value))} />
          </label>
          <label>
            Max
            <input type="number" value={settings.rangeMax} min={1000} step={1000} onChange={(e) => update('rangeMax', numberValue(e.target.value))} />
          </label>
        </div>
        <label>
          Points
          <input type="number" value={settings.points} min={2} max={1000} step={10} onChange={(e) => update('points', numberValue(e.target.value))} />
        </label>
      </div>

      <div className="control-section">
        <h2>Tax inputs</h2>
        <label>
          Tax class
          <select value={settings.stkl} onChange={(e) => update('stkl', Number(e.target.value) as PapExplorerSettings['stkl'])}>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Filing
          <select value={settings.filing} onChange={(e) => update('filing', e.target.value as PapExplorerSettings['filing'])}>
            <option value="single">Single</option>
            <option value="married">Married</option>
          </select>
        </label>
        <label>
          Children / ZKF
          <input type="number" value={settings.children} min={0} step={0.5} onChange={(e) => update('children', numberValue(e.target.value))} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.solidarity} onChange={(e) => update('solidarity', e.target.checked)} />
          Solidarity surcharge
        </label>
        <label>
          Church rate
          <select value={settings.churchRate} onChange={(e) => update('churchRate', numberValue(e.target.value))}>
            <option value={0}>None</option>
            <option value={0.08}>8%</option>
            <option value={0.09}>9%</option>
          </select>
        </label>
      </div>

      <div className="control-section">
        <h2>Insurance</h2>
        <label>
          KV Zusatzbeitrag %
          <input type="number" value={settings.kvz} min={0} step={0.1} onChange={(e) => update('kvz', numberValue(e.target.value))} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.pvs === 1} onChange={(e) => update('pvs', e.target.checked ? 1 : 0)} />
          Saxony care rate
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.pvz === 1} onChange={(e) => update('pvz', e.target.checked ? 1 : 0)} />
          Childless care surcharge
        </label>
        <label>
          Care child reduction
          <input type="number" value={settings.pva} min={0} max={4} step={1} onChange={(e) => update('pva', numberValue(e.target.value))} />
        </label>
      </div>

      <div className="control-section">
        <h2>Chart</h2>
        <div className="segmented-control" role="group" aria-label="Chart mode">
          <button type="button" className={chartMode === 'lines' ? 'active' : ''} onClick={() => onChartModeChange('lines')}>
            Lines
          </button>
          <button type="button" className={chartMode === 'stacked' ? 'active' : ''} onClick={() => onChartModeChange('stacked')}>
            Stacked
          </button>
          <button type="button" className={chartMode === 'percent' ? 'active' : ''} onClick={() => onChartModeChange('percent')}>
            Percent
          </button>
          <button type="button" className={chartMode === 'rates' ? 'active' : ''} onClick={() => onChartModeChange('rates')}>
            Rates
          </button>
        </div>
      </div>

      <div className="control-section">
        <h2>Chart lines</h2>
        <div className="metric-grid">
          {CHART_METRICS.map((metric) => (
            <label key={metric.key} className="checkbox-row metric-option">
              <input type="checkbox" checked={metrics.includes(metric.key)} disabled={chartMode !== 'lines'} onChange={() => toggleMetric(metric.key)} />
              {metric.label}
            </label>
          ))}
        </div>
      </div>
    </aside>
  )
}
