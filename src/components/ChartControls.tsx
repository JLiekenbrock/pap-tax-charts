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
  showDestatisIncomePercentiles: boolean
  onShowDestatisIncomePercentilesChange: (next: boolean) => void
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
  showDestatisIncomePercentiles,
  onShowDestatisIncomePercentilesChange,
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
          <div className="chart-controls-label">Ref</div>
          <label className="checkbox-row metric-option">
            <input
              type="checkbox"
              checked={showDestatisIncomePercentiles}
              onChange={(e) => onShowDestatisIncomePercentilesChange(e.target.checked)}
            />
            Destatis wage percentile rugs (p10–p99)
          </label>
        </div>
      )}

      {chartMode === 'lines' && filing === 'married' && onMarriedSocialSplitChange && (
        <div className="chart-controls-row">
          <div className="chart-controls-label">Married</div>
          <label className="checkbox-row metric-option">
            <input
              type="checkbox"
              checked={marriedSocialSplit}
              onChange={(e) => onMarriedSocialSplitChange(e.target.checked)}
            />
            Split social metrics by earner (RV / KV+PV / AV)
          </label>
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
    </section>
  )
}
