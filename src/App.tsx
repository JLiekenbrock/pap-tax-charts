import React from 'react'
import TaxInput, { PapExplorerSettings } from './components/TaxInput'
import TaxChart, { ChartMetric, ChartMode, RateBasis, toPapOptions } from './components/TaxChart'
import ChartControls from './components/ChartControls'
import Results, { type PapChartYear, siblingPapChartYear } from './components/Results'
import PrivilegeCheck from './components/PrivilegeCheck'
import TaxTips from './components/TaxTips'
import Glossary from './components/Glossary'
import TaxDistributionSimChart from './components/TaxDistributionSimChart'
import PercentileTaxContributionChart from './components/PercentileTaxContributionChart'
import {
  PapCalculationResult,
  calculatePapForMarriedHouseholdTotal,
  calculatePapResultFromRE4,
  findMinGrossPositiveReichen,
  MAX_CHART_SALARY_EUR,
  paddedChartMaxForReichenZone,
} from './lib/pap'
import {
  explorerNominalWageEUR,
  explorerSettingsAfterRealIncomeToggle,
  explorerStoredWageFromNominalEUR,
} from './lib/explorer_real_income'
import { deriveStkl } from './lib/stkl'
import { DESTATIS_FULLTIME_WAGE_P99_MAX_EUR_2024 } from './lib/privilege_benchmark'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}



const SERIES_POINTS_MIN = 180
const SERIES_POINTS_MAX = 500

function buildSeries(settings: PapExplorerSettings): PapCalculationResult[] {
  const min = Math.max(0, Math.min(settings.rangeMin, settings.rangeMax))
  const max = Math.max(min, settings.rangeMax)
  const effMin = min
  const span = max - effMin
  const pointCount =
    span <= 0
      ? 1
      : Math.min(SERIES_POINTS_MAX, Math.max(SERIES_POINTS_MIN, Math.ceil(span / 20_000)))
  const step = pointCount <= 1 ? 0 : span / (pointCount - 1)
  const opts = toPapOptions(settings)
  const y = settings.year
  const nominalRef1 = explorerNominalWageEUR(Math.max(0, settings.income1), y, settings)
  const nominalRef2 = explorerNominalWageEUR(Math.max(0, settings.income2), y, settings)

  return Array.from({ length: pointCount }, (_, index) => {
    const storedSweep = pointCount <= 1 ? effMin : Math.round(effMin + step * index)
    const nominalSweep = explorerNominalWageEUR(storedSweep, y, settings)
    if (settings.filing === 'married') {
      return calculatePapForMarriedHouseholdTotal(nominalSweep, nominalRef1, nominalRef2, opts)
    }
    return calculatePapResultFromRE4(nominalSweep, opts)
  })
}

/**
 * Tariff‑year comparison: identical nominal wage RE4 for every column (anchor = explorer {@link PapExplorerSettings.year});
 * each column evaluates PAP rules for its own tariff year only.
 */
function papSnapshotAtIncome(settings: PapExplorerSettings, tariffYear: number): PapCalculationResult {
  const explorerYear = settings.year
  const opts = toPapOptions({ ...settings, year: tariffYear })
  if (settings.filing === 'married') {
    const n1 = explorerNominalWageEUR(Math.max(0, settings.income1), explorerYear, settings)
    const n2 = explorerNominalWageEUR(Math.max(0, settings.income2), explorerYear, settings)
    return calculatePapResultFromRE4(n1, { ...opts, partnerRe4: n2 })
  }
  return calculatePapResultFromRE4(
    explorerNominalWageEUR(Math.max(0, settings.income), explorerYear, settings),
    opts,
  )
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
  realIncomeMode: false,
  realIncomeBaseYear: 2021,
  proMode: false,
  beamtenMode: false,
}

export default function App() {
  const [settings, setSettings] = React.useState<PapExplorerSettings>(DEFAULT_SETTINGS)
  const [metrics, setMetrics] = React.useState<ChartMetric[]>(['tax', 'zve', 'vsp', 'reichenPayroll'])
  const [chartMode, setChartMode] = React.useState<ChartMode>('lines')
  const [rateBasis, setRateBasis] = React.useState<RateBasis>('gross')
  const [vspInRates, setVspInRates] = React.useState(true)
  const [vspInComposition, setVspInComposition] = React.useState(true)
  const [investmentInRates, setInvestmentInRates] = React.useState(true)
  const [marriedSocialSplit, setMarriedSocialSplit] = React.useState(false)
  const [percentileAxis, setPercentileAxis] = React.useState(false)
  const [yearCompareEnabled, setYearCompareEnabled] = React.useState(false)
  const [compareYearA, setCompareYearA] = React.useState<PapChartYear>(2025)
  const [compareYearB, setCompareYearB] = React.useState<PapChartYear>(2026)

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
    const y = settings.year
    const income1 = Math.max(0, settings.income1)
    const income2 = Math.max(0, settings.income2)
    const filingIncome = settings.filing === 'married' ? income1 + income2 : Math.max(0, settings.income)
    const highestIncomeStored = Math.max(filingIncome, income1 + income2, 10_000)
    const nominal1 = explorerNominalWageEUR(income1, y, settings)
    const nominal2 = explorerNominalWageEUR(income2, y, settings)
    const nominalHighest = explorerNominalWageEUR(highestIncomeStored, y, settings)
    const rangeMin = 0
    const rangeMaxBaseNominal = Math.max(30000, Math.ceil((nominalHighest * 1.5 + 10000) / 1000) * 1000)
    const papOptsPreRange = toPapOptions({
      ...settings,
      stkl: stklDerivation.stkl,
      investmentIncome: Math.max(0, settings.investmentIncome),
      kindergeldChildren: Math.max(0, Math.floor(settings.kindergeldChildren)),
    })
    const reichenSweepMin = findMinGrossPositiveReichen(
      papOptsPreRange,
      settings.filing === 'married' ? { income1: nominal1, income2: nominal2 } : undefined,
    )
    const reichenStretch =
      reichenSweepMin != null ? paddedChartMaxForReichenZone(reichenSweepMin, 5000) : 0
    const rangeMaxUncappedNominal = Math.max(
      rangeMaxBaseNominal,
      DESTATIS_FULLTIME_WAGE_P99_MAX_EUR_2024,
      reichenStretch,
    )
    const rangeMaxNominal = Math.min(rangeMaxUncappedNominal, MAX_CHART_SALARY_EUR)
    const rangeMax = explorerStoredWageFromNominalEUR(rangeMaxNominal, y, settings)
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

  React.useEffect(() => {
    if (chartMode === 'stacked' || chartMode === 'percent') {
      setPercentileAxis(false)
    }
  }, [chartMode])

  const papOpts = React.useMemo(() => toPapOptions(normalizedSettings), [normalizedSettings])

  const current = React.useMemo(() => {
    const y = normalizedSettings.year
    if (normalizedSettings.filing === 'married') {
      const n1 = explorerNominalWageEUR(normalizedSettings.income1, y, normalizedSettings)
      const n2 = explorerNominalWageEUR(normalizedSettings.income2, y, normalizedSettings)
      return calculatePapResultFromRE4(n1, {
        ...papOpts,
        partnerRe4: n2,
      })
    }
    return calculatePapResultFromRE4(
      explorerNominalWageEUR(normalizedSettings.income, y, normalizedSettings),
      papOpts,
    )
  }, [normalizedSettings, papOpts])
  const series = React.useMemo(() => buildSeries(normalizedSettings), [normalizedSettings])

  const resultCompareA = React.useMemo(
    () =>
      yearCompareEnabled && compareYearA !== compareYearB
        ? papSnapshotAtIncome(normalizedSettings, compareYearA)
        : null,
    [normalizedSettings, yearCompareEnabled, compareYearA, compareYearB],
  )

  const resultCompareB = React.useMemo(
    () =>
      yearCompareEnabled && compareYearA !== compareYearB
        ? papSnapshotAtIncome(normalizedSettings, compareYearB)
        : null,
    [normalizedSettings, yearCompareEnabled, compareYearA, compareYearB],
  )

  const otherPapYear = React.useCallback((y: PapChartYear): PapChartYear => siblingPapChartYear(y), [])

  const onCompareYearAChange = React.useCallback(
    (y: PapChartYear) => {
      setCompareYearA(y)
      setCompareYearB((b) => (b === y ? otherPapYear(y) : b))
    },
    [otherPapYear],
  )

  const onCompareYearBChange = React.useCallback(
    (y: PapChartYear) => {
      setCompareYearB(y)
      setCompareYearA((a) => (a === y ? otherPapYear(y) : a))
    },
    [otherPapYear],
  )

  const onSwapCompareYears = React.useCallback(() => {
    const nextA = compareYearB
    const nextB = compareYearA
    setCompareYearA(nextA)
    setCompareYearB(nextB)
  }, [compareYearA, compareYearB])

  const onExplorerRealIncomeModeChange = React.useCallback(
    (enabled: boolean) => {
      setSettings(explorerSettingsAfterRealIncomeToggle(enabled, normalizedSettings))
    },
    [normalizedSettings],
  )

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
            filing={normalizedSettings.filing}
            marriedSocialSplit={marriedSocialSplit}
            onMarriedSocialSplitChange={setMarriedSocialSplit}
            percentileAxis={percentileAxis}
            onPercentileAxisChange={setPercentileAxis}
            vspInRates={vspInRates}
            onVspInRatesChange={setVspInRates}
            vspInComposition={vspInComposition}
            onVspInCompositionChange={setVspInComposition}
            investmentInRates={investmentInRates}
            onInvestmentInRatesChange={setInvestmentInRates}
            realIncomeMode={normalizedSettings.realIncomeMode}
            onRealIncomeModeChange={onExplorerRealIncomeModeChange}
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
            marriedSocialSplit={marriedSocialSplit}
            percentileAxis={percentileAxis}
          />
          <Results
            result={current}
            settings={normalizedSettings}
            vspInRates={vspInRates}
            yearCompareEnabled={yearCompareEnabled}
            onYearCompareEnabledChange={setYearCompareEnabled}
            compareYearA={compareYearA}
            compareYearB={compareYearB}
            onCompareYearAChange={onCompareYearAChange}
            onCompareYearBChange={onCompareYearBChange}
            onSwapCompareYears={onSwapCompareYears}
            resultCompareA={resultCompareA}
            resultCompareB={resultCompareB}
          />
          <TaxDistributionSimChart
            explorer={normalizedSettings}
            vspInRates={vspInRates}
            investmentInRates={investmentInRates}
          />
          <PrivilegeCheck result={current} settings={normalizedSettings} />
          <PercentileTaxContributionChart explorer={normalizedSettings} />
          <TaxTips
            result={current}
            options={papOpts}
            partner1Income={normalizedSettings.income1}
            partner2Income={normalizedSettings.income2}
            beamtenMode={normalizedSettings.beamtenMode}
          />
          <Glossary />
        </div>
      </section>
    </main>
  )
}
