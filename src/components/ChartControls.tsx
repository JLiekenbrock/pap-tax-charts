import React from 'react'
import { ChartMetric, ChartMode, RateBasis, CHART_METRICS } from './TaxChart'
import type { PapExplorerSettings } from './TaxInput'

type Props = {
  chartMode: ChartMode
  onChartModeChange: (next: ChartMode) => void
  rateBasis: RateBasis
  onRateBasisChange: (next: RateBasis) => void
  metrics: ChartMetric[]
  onMetricsChange: (next: ChartMetric[]) => void
  filing?: PapExplorerSettings['filing']
  marriedSocialSplit?: boolean
  onMarriedSocialSplitChange?: (next: boolean) => void
  realIncomeMode: boolean
  onRealIncomeModeChange: (next: boolean) => void
  percentileAxis: boolean
  onPercentileAxisChange: (next: boolean) => void
  vspInRates: boolean
  onVspInRatesChange: (next: boolean) => void
  vspInComposition: boolean
  onVspInCompositionChange: (next: boolean) => void
  investmentInRates: boolean
  onInvestmentInRatesChange: (next: boolean) => void
}

const MODES: Array<{ value: ChartMode; label: string }> = [
  { value: 'lines', label: 'Lines' },
  { value: 'stacked', label: 'Stacked' },
  { value: 'percent', label: 'Percent' },
  { value: 'rates', label: 'Rates' },
  { value: 'decomposition', label: 'Decomposition' },
]

export default function ChartControls({
  chartMode,
  onChartModeChange,
  rateBasis,
  onRateBasisChange,
  metrics,
  onMetricsChange,
  filing = 'single',
  marriedSocialSplit = false,
  onMarriedSocialSplitChange,
  realIncomeMode,
  onRealIncomeModeChange,
  percentileAxis,
  onPercentileAxisChange,
  vspInRates,
  onVspInRatesChange,
  vspInComposition,
  onVspInCompositionChange,
  investmentInRates,
  onInvestmentInRatesChange,
}: Props) {
  const toggleMetric = (metric: ChartMetric) => {
    if (metrics.includes(metric)) {
      const next = metrics.filter((item) => item !== metric)
      onMetricsChange(next.length ? next : ['tax'])
    } else {
      onMetricsChange([...metrics, metric])
    }
  }

  const showBasis = chartMode === 'rates' || chartMode === 'decomposition'

  return (
    <section className="chart-controls">
      <div className="chart-controls-row">
        <div className="chart-controls-label">Mode</div>
        <div className="segmented-control" role="group" aria-label="Chart mode">
          {MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={chartMode === mode.value ? 'active' : ''}
              onClick={() => onChartModeChange(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-controls-row">
        <div className="chart-controls-label">Salaries</div>
        <div className="segmented-control" role="group" aria-label="Salary input units (inflation adjustment)">
          <button
            type="button"
            className={!realIncomeMode ? 'active' : ''}
            onClick={() => onRealIncomeModeChange(false)}
          >
            Nominal (tariff €)
          </button>
          <button
            type="button"
            className={realIncomeMode ? 'active' : ''}
            onClick={() => onRealIncomeModeChange(true)}
            title="Konstant‑EUR using Destatis VPI; PAP still evaluates nominal RE4 for the tariff year"
          >
            Real (VPI)
          </button>
        </div>
      </div>

      {showBasis && (
        <div className="chart-controls-row">
          <div className="chart-controls-label">Basis</div>
          <div className="segmented-control" role="group" aria-label="Rate basis">
            <button type="button" className={rateBasis === 'gross' ? 'active' : ''} onClick={() => onRateBasisChange('gross')}>
              Per gross
            </button>
            <button type="button" className={rateBasis === 'zve' ? 'active' : ''} onClick={() => onRateBasisChange('zve')}>
              Per ZVE
            </button>
          </div>
        </div>
      )}

      {chartMode !== 'stacked' && chartMode !== 'percent' && (
        <div className="chart-controls-row">
          <div className="chart-controls-label">X axis</div>
          <div className="segmented-control" role="group" aria-label="Salary chart x-axis">
            <button
              type="button"
              className={!percentileAxis ? 'active' : ''}
              onClick={() => onPercentileAxisChange(false)}
            >
              Linear €
            </button>
            <button
              type="button"
              className={percentileAxis ? 'active' : ''}
              onClick={() => onPercentileAxisChange(true)}
            >
              Percentile p
            </button>
          </div>
        </div>
      )}

      {chartMode === 'lines' && (
        <details className="chart-controls-metrics">
          <summary>Metrics ({metrics.length} selected)</summary>
          <div className="metric-grid">
            {CHART_METRICS.map((metric) => (
              <label key={metric.key} className="checkbox-row metric-option">
                <input type="checkbox" checked={metrics.includes(metric.key)} onChange={() => toggleMetric(metric.key)} />
                {metric.label}
              </label>
            ))}
          </div>
        </details>
      )}

      <div className="chart-controls-metrics chart-controls-chart-prefs-wrap">
        <div className="chart-controls-chart-prefs-caption">Also drives rates / decomposition / stacked visuals</div>
        <div className="chart-controls-checkbox-row" role="group" aria-label="Chart option toggles">
          {chartMode === 'lines' && filing === 'married' && onMarriedSocialSplitChange ? (
            <label
              className="metric-option chart-controls-checkbox-compact"
              title="Split RV / KV+PV / AV metrics by earner (lines mode)"
            >
              <input
                type="checkbox"
                checked={marriedSocialSplit}
                onChange={(e) => onMarriedSocialSplitChange(e.target.checked)}
              />
              Split social by earner
            </label>
          ) : null}
          <label className="metric-option chart-controls-checkbox-compact" title="Include VSP in marginal tax-rate paths">
            <input type="checkbox" checked={vspInRates} onChange={(e) => onVspInRatesChange(e.target.checked)} />
            VSP in tax rates
          </label>
          <label className="metric-option chart-controls-checkbox-compact" title="Include social contributions in stacked and percent charts">
            <input type="checkbox" checked={vspInComposition} onChange={(e) => onVspInCompositionChange(e.target.checked)} />
            Social in stacked / %
          </label>
          <label className="metric-option chart-controls-checkbox-compact" title="Include capital gains in marginal tax-rate paths">
            <input type="checkbox" checked={investmentInRates} onChange={(e) => onInvestmentInRatesChange(e.target.checked)} />
            Cap. gains in tax rates
          </label>
        </div>
      </div>
    </section>
  )
}
