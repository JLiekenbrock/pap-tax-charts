import React from 'react'
import TaxInput, { PapExplorerSettings } from './components/TaxInput'
import TaxChart, { ChartMetric, ChartMode, RateBasis } from './components/TaxChart'
import ChartControls from './components/ChartControls'
import Results from './components/Results'
import TaxTips from './components/TaxTips'
import { PapCalculationResult, calculatePapResultFromRE4 } from './lib/pap'
import { deriveStkl } from './lib/stkl'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const SERIES_POINTS = 180

function buildSeries(settings: PapExplorerSettings): PapCalculationResult[] {
  const min = Math.max(0, Math.min(settings.rangeMin, settings.rangeMax))
  const max = Math.max(min, settings.rangeMax)
  const step = (max - min) / (SERIES_POINTS - 1)

  return Array.from({ length: SERIES_POINTS }, (_, index) => {
    const income = Math.round(min + step * index)
    return calculatePapResultFromRE4(income, settings)
  })
}

const DEFAULT_SETTINGS: PapExplorerSettings = {
  income: 60000,
  income1: 60000,
  income2: 0,
  investmentIncome: 0,
  includeKindergeld: false,
  kindergeldChildren: 0,
  rangeMin: 0,
  rangeMax: 120000,
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
  proMode: false,
}

export default function App() {
  const [settings, setSettings] = React.useState<PapExplorerSettings>(DEFAULT_SETTINGS)
  const [metrics, setMetrics] = React.useState<ChartMetric[]>(['tax', 'zve', 'vsp'])
  const [chartMode, setChartMode] = React.useState<ChartMode>('lines')
  const [rateBasis, setRateBasis] = React.useState<RateBasis>('gross')
  const [vspInRates, setVspInRates] = React.useState(true)
  const [vspInComposition, setVspInComposition] = React.useState(true)
  const [investmentInRates, setInvestmentInRates] = React.useState(true)

  const stklDerivation = React.useMemo(
    () =>
      deriveStkl({
        filing: settings.filing,
        children: settings.children,
        income1: Math.max(0, settings.filing === 'married' ? settings.income1 : settings.income),
        income2: Math.max(0, settings.filing === 'married' ? settings.income2 : 0),
      }),
    [settings.filing, settings.children, settings.income, settings.income1, settings.income2],
  )

  const normalizedSettings = React.useMemo(() => {
    const income1 = Math.max(0, settings.income1)
    const income2 = Math.max(0, settings.income2)
    const filingIncome = settings.filing === 'married' ? income1 + income2 : Math.max(0, settings.income)
    const highestIncome = Math.max(filingIncome, income1 + income2, 10000)
    const rangeMin = 0
    const rangeMax = Math.max(30000, Math.ceil((highestIncome * 1.5 + 10000) / 1000) * 1000)
    const income = clamp(filingIncome, rangeMin, rangeMax)
    const kindergeldChildren = Math.max(0, Math.floor(settings.kindergeldChildren))
    return {
      ...settings,
      rangeMin,
      rangeMax,
      income,
      income1,
      income2,
      investmentIncome: Math.max(0, settings.investmentIncome),
      kindergeldChildren,
      stkl: stklDerivation.stkl,
    }
  }, [settings, stklDerivation])

  const current = React.useMemo(
    () => calculatePapResultFromRE4(normalizedSettings.income, normalizedSettings),
    [normalizedSettings],
  )
  const seriesSettings = React.useMemo<PapExplorerSettings>(() => ({
    ...normalizedSettings,
    // Series depends on range and tax options, not on the currently selected income point.
    income: normalizedSettings.rangeMin,
    income1: normalizedSettings.rangeMin,
    income2: 0,
  }), [
    normalizedSettings.rangeMin,
    normalizedSettings.rangeMax,
    normalizedSettings.year,
    normalizedSettings.filing,
    normalizedSettings.stkl,
    normalizedSettings.children,
    normalizedSettings.solidarity,
    normalizedSettings.churchRate,
    normalizedSettings.kvz,
    normalizedSettings.pvs,
    normalizedSettings.pvz,
    normalizedSettings.pva,
    normalizedSettings.krv,
    normalizedSettings.alv,
    normalizedSettings.pkv,
    normalizedSettings.pkpv,
    normalizedSettings.pkpvagz,
    normalizedSettings.investmentIncome,
    normalizedSettings.includeKindergeld,
    normalizedSettings.kindergeldChildren,
  ])
  const series = React.useMemo(() => buildSeries(seriesSettings), [seriesSettings])

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
          stklDerivation={stklDerivation}
        />
        <div className="visual-pane">
          <ChartControls
            chartMode={chartMode}
            onChartModeChange={setChartMode}
            rateBasis={rateBasis}
            onRateBasisChange={setRateBasis}
            metrics={metrics}
            onMetricsChange={setMetrics}
          />
          <TaxChart
            series={series}
            currentIncome={normalizedSettings.income}
            metrics={metrics}
            mode={chartMode}
            settings={normalizedSettings}
            rateBasis={rateBasis}
            vspInRates={vspInRates}
            vspInComposition={vspInComposition}
            investmentInRates={investmentInRates}
          />
          <Results
            result={current}
            settings={normalizedSettings}
            vspInRates={vspInRates}
            onVspInRatesChange={setVspInRates}
            vspInComposition={vspInComposition}
            onVspInCompositionChange={setVspInComposition}
            investmentInRates={investmentInRates}
            onInvestmentInRatesChange={setInvestmentInRates}
          />
          <TaxTips
            result={current}
            options={normalizedSettings}
            partner1Income={normalizedSettings.income1}
            partner2Income={normalizedSettings.income2}
          />
        </div>
      </section>
    </main>
  )
}
