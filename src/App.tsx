import React from 'react'
import TaxInput, { PapExplorerSettings } from './components/TaxInput'
import TaxChart, { ChartMetric, ChartMode } from './components/TaxChart'
import Results from './components/Results'
import { PapCalculationResult, calculatePapResultFromRE4 } from './lib/pap'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function buildSeries(settings: PapExplorerSettings): PapCalculationResult[] {
  const min = Math.max(0, Math.min(settings.rangeMin, settings.rangeMax))
  const max = Math.max(min, settings.rangeMax)
  const points = clamp(settings.points, 2, 1000)
  const step = points === 1 ? 0 : (max - min) / (points - 1)

  return Array.from({ length: points }, (_, index) => {
    const income = Math.round(min + step * index)
    return calculatePapResultFromRE4(income, settings)
  })
}

const DEFAULT_SETTINGS: PapExplorerSettings = {
  income: 60000,
  income1: 60000,
  income2: 0,
  includeKindergeld: false,
  kindergeldChildren: 0,
  rangeMin: 0,
  rangeMax: 120000,
  points: 180,
  year: 2026,
  filing: 'single',
  stkl: 1,
  children: 0,
  solidarity: false,
  churchRate: 0,
  kvz: 0,
  pvs: 0,
  pvz: 0,
  pva: 0,
  krv: 0,
  alv: 0,
  pkv: 0,
  pkpv: 0,
  pkpvagz: 0,
}

export default function App() {
  const [settings, setSettings] = React.useState<PapExplorerSettings>(DEFAULT_SETTINGS)
  const [metrics, setMetrics] = React.useState<ChartMetric[]>(['tax', 'zve', 'vsp'])
  const [chartMode, setChartMode] = React.useState<ChartMode>('lines')

  const normalizedSettings = React.useMemo(() => {
    const rangeMin = Math.max(0, Math.min(settings.rangeMin, settings.rangeMax))
    const rangeMax = Math.max(rangeMin + 1000, settings.rangeMax)
    const income1 = clamp(settings.income1, 0, rangeMax)
    const income2 = clamp(settings.income2, 0, rangeMax)
    const income = settings.filing === 'married'
      ? clamp(income1 + income2, rangeMin, rangeMax)
      : clamp(settings.income, rangeMin, rangeMax)
    const kindergeldChildren = Math.max(0, Math.floor(settings.kindergeldChildren))
    return {
      ...settings,
      rangeMin,
      rangeMax,
      income,
      income1,
      income2,
      kindergeldChildren,
      points: clamp(settings.points, 2, 1000),
    }
  }, [settings])

  const current = React.useMemo(
    () => calculatePapResultFromRE4(normalizedSettings.income, normalizedSettings),
    [normalizedSettings],
  )
  const series = React.useMemo(() => buildSeries(normalizedSettings), [normalizedSettings])

  return (
    <main className="app-shell">
      <section className="app-header">
        <div>
          <h1>PAP tax explorer</h1>
          <p>Local 2026 PAP calculations for instant graphing and intermediate-value checks.</p>
        </div>
        <div className="status-pill">BMF-free runtime</div>
      </section>

      <section className="workspace">
        <TaxInput
          settings={normalizedSettings}
          onChange={setSettings}
          metrics={metrics}
          onMetricsChange={setMetrics}
          chartMode={chartMode}
          onChartModeChange={setChartMode}
        />
        <div className="visual-pane">
          <TaxChart series={series} currentIncome={normalizedSettings.income} metrics={metrics} mode={chartMode} />
          <Results result={current} settings={normalizedSettings} />
        </div>
      </section>
    </main>
  )
}
