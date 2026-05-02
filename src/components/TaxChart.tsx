import React from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ChartDataset,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import {
  PapCalculationResult,
  PapOptions,
  calculatePapForMarriedHouseholdTotal,
  calculatePapResultFromRE4,
  minZVeFloorForTariffTopBracket,
  tariffKztabRe4SweepPath,
  TARIFF_KZTAB_DUAL_EARNER_HOUSEHOLD,
  reichenTariffXThresholdForYear,
  MAX_CHART_SALARY_EUR,
  type MarriedEarnerSlice,
} from '../lib/pap'
import {
  MarginalDecomposition,
  RateBasis,
  actualContributions,
  marriedEarnerEmployeeSocial,
  marginalDecomposition,
  marginalTaxRate,
  marginalReichenPayrollPercent,
} from '../lib/rates'
import { PapExplorerSettings } from './TaxInput'
import {
  DESTATIS_CHART_INCOME_RUG_MARKERS_2024,
  DESTATIS_FULLTIME_WAGE_P99_MAX_EUR_2024,
  grossAtDeStatisPercentile,
  individualIncomePercentileDeStatis,
  PRIVILEGE_INCOME_SOURCE_LABEL,
} from '../lib/privilege_benchmark'
import { createIncomePercentileRugsPlugin } from '../lib/chart_income_percentile_rugs'

export function toPapOptions(settings: PapExplorerSettings): PapOptions {
  const {
    income: _income,
    income1: _income1,
    income2: _income2,
    rangeMin: _rangeMin,
    rangeMax: _rangeMax,
    includeKindergeld: _includeKindergeld,
    kindergeldChildren: _kindergeldChildren,
    ...rest
  } = settings
  void _income; void _income1; void _income2; void _rangeMin; void _rangeMax; void _includeKindergeld; void _kindergeldChildren
  return rest
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

export type ChartMetric =
  | 'tax'
  | 'payrollTax'
  | 'investmentTax'
  | 'investmentTaxable'
  | 'investmentIncome'
  | 'zve'
  | 'vsp'
  | 'ztabfb'
  | 'wvfrb'
  | 'baseTax'
  | 'reichenPayroll'
  | 'vspRenten'
  | 'vspKrankenPflege'
  | 'vspArbeitslosen'

type MetricConfig = {
  key: ChartMetric
  label: string
  color: string
  unit: 'eur' | 'percent'
  value: (point: PapCalculationResult) => number
}

export const CHART_METRICS: MetricConfig[] = [
  { key: 'tax', label: 'Tax', color: '#0F766E', unit: 'eur', value: (point) => point.tax },
  { key: 'payrollTax', label: 'Payroll tax', color: '#047857', unit: 'eur', value: (point) => point.payrollTax },
  {
    key: 'investmentTax',
    label: 'Capital gains tax',
    color: '#B45309',
    unit: 'eur',
    value: (point) => point.investmentTax + point.investmentSolz + point.investmentChurch,
  },
  { key: 'investmentTaxable', label: 'Capital gains taxable', color: '#CA8A04', unit: 'eur', value: (point) => point.investmentTaxable },
  { key: 'investmentIncome', label: 'Capital gains income', color: '#A16207', unit: 'eur', value: (point) => point.investmentIncome },
  { key: 'zve', label: 'ZVE', color: '#2563EB', unit: 'eur', value: (point) => point.zve },
  { key: 'vsp', label: 'VSP', color: '#7C3AED', unit: 'eur', value: (point) => point.vsp },
  { key: 'ztabfb', label: 'ZTABFB', color: '#EA580C', unit: 'eur', value: (point) => point.ztabfb },
  { key: 'wvfrb', label: 'WVFRB', color: '#0891B2', unit: 'eur', value: (point) => point.wvfrb },
  { key: 'baseTax', label: 'Base tax', color: '#DC2626', unit: 'eur', value: (point) => point.baseTax },
  {
    key: 'reichenPayroll',
    label: 'Reichensteuer (45% slice · share of payroll LSt)',
    color: '#9F1239',
    unit: 'eur',
    value: (point) => point.reichenPayrollEur,
  },
  { key: 'vspRenten', label: 'Pension', color: '#4F46E5', unit: 'eur', value: (point) => point.vspRenten },
  { key: 'vspKrankenPflege', label: 'Health/care', color: '#9333EA', unit: 'eur', value: (point) => point.vspKrankenPflege },
  { key: 'vspArbeitslosen', label: 'Unemployment', color: '#D97706', unit: 'eur', value: (point) => point.vspArbeitslosen },
]

const METRICS_WITH_MARRIED_SOCIAL_SPLIT: ChartMetric[] = ['vsp', 'vspRenten', 'vspKrankenPflege', 'vspArbeitslosen']

function earnerMetricValue(metric: ChartMetric, slice: MarriedEarnerSlice): number {
  switch (metric) {
    case 'vsp':
      return marriedEarnerEmployeeSocial(slice)
    case 'vspRenten':
      return slice.vspRenten
    case 'vspKrankenPflege':
      return slice.vspKrankenPflege
    case 'vspArbeitslosen':
      return slice.vspArbeitslosen
    default:
      return 0
  }
}

export type ChartMode = 'lines' | 'stacked' | 'percent' | 'rates' | 'decomposition'

export type { RateBasis }

function metricConfig(metric: ChartMetric) {
  return CHART_METRICS.find((item) => item.key === metric) ?? CHART_METRICS[0]
}

function formatEuro(value: number) {
  return `EUR ${Number(value).toLocaleString()}`
}

function formatPercent(value: number) {
  return `${Number(value).toFixed(2)}%`
}

/** Short axis labels for salary EUR tick marks (compact k/M). */
function formatCompactSalaryAxisEur(eur: number): string {
  const v = Math.round(eur)
  if (!Number.isFinite(v)) return ''
  const av = Math.abs(v)
  if (av >= 1_000_000) {
    const m = av / 1_000_000
    const t = m >= 100 ? Math.round(m) : Math.round(m * 10) / 10
    const s = t % 1 === 0 ? String(Math.round(t)) : String(t).replace(/\.0$/, '')
    return `${s}M`
  }
  if (av >= 10_000) return `${Math.round(av / 1_000)}k`
  return `${av}`
}

const selectedIncomePlugin = {
  id: 'selectedIncomeLine',
  afterDatasetsDraw(
    chart: ChartJS,
    _args: unknown,
    pluginOptions: { income?: number; selectedIndex?: number; selectedXCoordinate?: number },
  ) {
    const income = pluginOptions.income
    if (income == null || !Number.isFinite(income)) return

    const { ctx, chartArea, scales } = chart
    const xScale = scales.x
    if (!xScale || !chartArea) return

    const selectedIndex = pluginOptions.selectedIndex
    const selectedX = pluginOptions.selectedXCoordinate

    let x: number
    if (typeof selectedIndex === 'number') {
      x = xScale.getPixelForValue(selectedIndex)
    } else if (typeof selectedX === 'number' && Number.isFinite(selectedX)) {
      x = xScale.getPixelForValue(selectedX)
    } else {
      x = xScale.getPixelForValue(income)
    }
    if (x < chartArea.left || x > chartArea.right) return

    ctx.save()
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.moveTo(x, chartArea.top)
    ctx.lineTo(x, chartArea.bottom)
    ctx.stroke()

    const label = formatEuro(income)
    ctx.setLineDash([])
    ctx.font = '12px Inter, system-ui, sans-serif'
    const paddingX = 7
    const textWidth = ctx.measureText(label).width
    const boxWidth = textWidth + paddingX * 2
    const boxHeight = 24
    const boxX = Math.min(Math.max(x + 8, chartArea.left), chartArea.right - boxWidth)
    const boxY = chartArea.top + 8

    ctx.fillStyle = '#111827'
    ctx.beginPath()
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 5)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, boxX + paddingX, boxY + boxHeight / 2)
    ctx.restore()
  },
}

type StackPart = {
  key: string
  label: string
  color: string
  value: (point: PapCalculationResult) => number
}

export default function TaxChart({
  series,
  currentIncome,
  metrics,
  mode,
  settings,
  rateBasis,
  vspInRates,
  vspInComposition,
  investmentInRates,
  marriedSocialSplit = false,
  percentileAxis = false,
}: {
  series: PapCalculationResult[]
  currentIncome: number
  metrics: ChartMetric[]
  mode: ChartMode
  settings: PapExplorerSettings
  rateBasis: RateBasis
  vspInRates: boolean
  vspInComposition: boolean
  investmentInRates: boolean
  /** When married, split RV/KV/AV lines across earners (lines mode, social metrics only). */
  marriedSocialSplit?: boolean
  /**
   * When true (non-stacked/non-percent charts), salary x-axis uses Destatis percentile rank with uniform spacing per percentile.
   */
  percentileAxis?: boolean
}) {
  const usesLineScatterX = mode !== 'stacked' && mode !== 'percent'
  const percentileScaleXActive = percentileAxis && usesLineScatterX

  const lineXPercentileBounds = React.useMemo(() => {
    if (!percentileScaleXActive) return { minP: 0, maxP: 100 }
    const lo = Math.max(0, Math.min(settings.rangeMin, settings.rangeMax))
    const hi = Math.max(lo, settings.rangeMax)
    const minP = individualIncomePercentileDeStatis(lo)
    const maxP = individualIncomePercentileDeStatis(hi)
    return minP <= maxP ? { minP, maxP } : { minP: maxP, maxP: minP }
  }, [percentileScaleXActive, settings.rangeMin, settings.rangeMax])

  const salaryToLineDatasetX = React.useCallback(
    (salaryEuro: number): number =>
      percentileScaleXActive ? individualIncomePercentileDeStatis(Math.max(0, salaryEuro)) : salaryEuro,
    [percentileScaleXActive],
  )
  const isCategoryX = mode === 'stacked' || mode === 'percent'
  const lineMetrics = React.useMemo(() => {
    const selected = metrics.map((metric) => metricConfig(metric))
    return selected.length ? selected : [metricConfig('tax')]
  }, [metrics])

  const cashStackParts = React.useMemo<StackPart[]>(() => {
    const parts: StackPart[] = [
      {
        key: 'payrollCore',
        label: 'Payroll tax (excl. 45 % slice)',
        color: '#047857',
        value: (point) => Math.max(0, point.payrollTax - point.reichenPayrollEur),
      },
      {
        key: 'reichenPayroll',
        label: 'Reichensteuer (45% · payroll incl. proportional Soli/KiSt)',
        color: '#9F1239',
        value: (point) => Math.max(0, point.reichenPayrollEur),
      },
      {
        key: 'capitalGainsTax',
        label: 'Capital gains tax',
        color: '#B45309',
        value: (point) => Math.max(0, point.investmentTax + point.investmentSolz + point.investmentChurch),
      },
    ]
    if (vspInComposition) {
      parts.push({
        key: 'vsp',
        label: 'Social (RV+KV+AV)',
        color: '#7C3AED',
        value: (point) => Math.max(0, actualContributions(point)),
      })
    }
    parts.push({
      key: 'usableSalary',
      label: 'Net after payroll tax & social',
      color: '#64748B',
      value: (point) =>
        Math.max(
          0,
          point.income - point.payrollTax - (vspInComposition ? actualContributions(point) : 0),
        ),
    })
    parts.push({
      key: 'usableInvestment',
      label: 'Usable investment income',
      color: '#0EA5E9',
      value: (point) => {
        const investmentTaxTotal = point.investmentTax + point.investmentSolz + point.investmentChurch
        return Math.max(0, point.investmentIncome - investmentTaxTotal)
      },
    })
    return parts
  }, [vspInComposition])

  // Height of each stacked bar is exactly salary + investment income (layers add up).
  // Pin the EUR axis to range + investments so toggling tax year does not rescale the Y axis.
  const stableEuroYMax = React.useMemo(() => {
    const salaryCap = Math.max(0, settings.rangeMax)
    const inv = Math.max(0, settings.investmentIncome)
    const raw = salaryCap + inv
    if (raw <= 0) return 10_000
    return Math.ceil((raw * 1.03) / 5000) * 5000
  }, [settings.rangeMax, settings.investmentIncome])

  const categoryIncomesForRugs = React.useMemo(
    () => (mode === 'stacked' || mode === 'percent' ? series.map((p) => p.income) : null),
    [mode, series],
  )

  const clipXMinEur = Math.max(0, Math.min(settings.rangeMin, settings.rangeMax))
  const clipXMaxEur = Math.max(clipXMinEur, settings.rangeMax)

  const incomePercentilePlugin = React.useMemo(
    () =>
      createIncomePercentileRugsPlugin({
        enabled: true,
        clipXMinEur,
        clipXMaxEur,
        markers: DESTATIS_CHART_INCOME_RUG_MARKERS_2024,
        categoryIncomes: categoryIncomesForRugs,
        ...(percentileScaleXActive ? { xFromIncomeEur: individualIncomePercentileDeStatis } : {}),
      }),
    [clipXMinEur, clipXMaxEur, categoryIncomesForRugs, percentileScaleXActive],
  )

  const chartPlugins = React.useMemo(
    () => [incomePercentilePlugin, selectedIncomePlugin],
    [incomePercentilePlugin, selectedIncomePlugin],
  )

  let selectedIndex = 0
  for (let i = 0; i < series.length; i++) {
    if (Math.abs(series[i].income - currentIncome) < Math.abs(series[selectedIndex]?.income - currentIncome)) selectedIndex = i
  }
  const ratesSeries = React.useMemo(() => {
    if (mode !== 'rates' && mode !== 'decomposition') return series
    if (series.length === 0) return series
    // Use UI range ends — the main `series` uses rounded steps so the last
    // point can sit short of `rangeMax`, which makes rates/decomposition
    // lines stop before the chart's intended x domain.
    const minIncome = Math.max(0, settings.rangeMin)
    const maxIncome = Math.max(minIncome, settings.rangeMax)
    const span = maxIncome - minIncome
    const targetPoints = 1200
    const interval = span <= 0 ? 1000 : Math.max(1000, Math.ceil(span / targetPoints))
    const opts = toPapOptions(settings)
    const marriedChartRef =
      settings.filing === 'married'
        ? { income1: settings.income1, income2: settings.income2 }
        : undefined
    const points: PapCalculationResult[] = []
    for (let income = minIncome; income <= maxIncome; income += interval) {
      points.push(
        marriedChartRef
          ? calculatePapForMarriedHouseholdTotal(income, marriedChartRef.income1, marriedChartRef.income2, opts)
          : calculatePapResultFromRE4(income, opts),
      )
    }
    const last = points[points.length - 1]
    if (!last || last.income !== maxIncome) {
      points.push(
        marriedChartRef
          ? calculatePapForMarriedHouseholdTotal(maxIncome, marriedChartRef.income1, marriedChartRef.income2, opts)
          : calculatePapResultFromRE4(maxIncome, opts),
      )
    }
    return points
  }, [mode, series.length, settings, usesLineScatterX])

  const decompositionRates = React.useMemo(() => {
    if (mode !== 'decomposition') return [] as MarginalDecomposition[]
    const opts = toPapOptions(settings)
    const marriedChartRef =
      settings.filing === 'married'
        ? { income1: settings.income1, income2: settings.income2 }
        : undefined
    return ratesSeries.map((point) =>
      marginalDecomposition(point.income, opts, rateBasis, { marriedChartRef }),
    )
  }, [mode, ratesSeries, settings, rateBasis])

  const marginalRates = React.useMemo(() => {
    if (mode !== 'rates') return [] as (number | null)[]
    const opts = toPapOptions(settings)
    const marriedChartRef =
      settings.filing === 'married'
        ? { income1: settings.income1, income2: settings.income2 }
        : undefined
    // Use null for points with too small a denominator so the chart skips them
    // instead of showing huge spikes (same logic as ratePercent).
    const raw = ratesSeries.map((point) => {
      const denom = rateBasis === 'zve' ? point.zve : point.income
      if (denom < 1000) return null
      return marginalTaxRate(point.income, opts, rateBasis, {
        includeVspInRate: vspInRates,
        marriedChartRef,
      })
    })
    // Centered moving average (window=5) to smooth out single-point spikes caused
    // by PAP bracket transitions and VSP BBG (Beitragsbemessungsgrenze) thresholds.
    const window = 2
    return raw.map((value, i) => {
      if (value === null) return null
      let sum = 0
      let count = 0
      for (let j = Math.max(0, i - window); j <= Math.min(raw.length - 1, i + window); j++) {
        const v = raw[j]
        if (v === null) continue
        sum += v
        count++
      }
      return count > 0 ? sum / count : null
    })
  }, [mode, ratesSeries, settings, rateBasis, vspInRates])

  const marginalReichenPayrollRates = React.useMemo(() => {
    if (mode !== 'rates') return [] as (number | null)[]
    const opts = toPapOptions(settings)
    const marriedChartRef =
      settings.filing === 'married'
        ? { income1: settings.income1, income2: settings.income2 }
        : undefined
    const raw = ratesSeries.map((point) => {
      const denom = rateBasis === 'zve' ? point.zve : point.income
      if (denom < 1000) return null
      return marginalReichenPayrollPercent(point.income, opts, rateBasis, {
        delta: 500,
        marriedChartRef,
      })
    })
    const window = 2
    return raw.map((value, i) => {
      if (value === null) return null
      let sum = 0
      let count = 0
      for (let j = Math.max(0, i - window); j <= Math.min(raw.length - 1, i + window); j++) {
        const v = raw[j]
        if (v === null) continue
        sum += v
        count++
      }
      return count > 0 ? sum / count : null
    })
  }, [mode, ratesSeries, settings, rateBasis])

  const data = {
    labels: mode === 'stacked' || mode === 'percent' ? series.map((point) => point.income) : undefined,
    datasets: mode === 'percent'
      ? cashStackParts.map((part): ChartDataset<'bar'> => ({
          label: part.label,
          data: series.map((point) => {
            const total = cashStackParts.reduce((sum, item) => sum + item.value(point), 0)
            return total > 0 ? (part.value(point) / total) * 100 : 0
          }),
          stack: 'total',
          borderColor: part.color,
          backgroundColor: part.color,
          borderWidth: 0,
          borderSkipped: false,
          barPercentage: 1,
          categoryPercentage: 1,
          yAxisID: 'yPercent',
        }))
      : mode === 'rates'
        ? (() => {
            const basisName = rateBasis === 'zve' ? 'ZVE' : 'salary'
            const basisLabel = investmentInRates ? `${basisName} + investments` : basisName
            // When VSP is in the numerator we're plotting the combined burden,
            // not just tax. Make that explicit so a non-zero value below the
            // Grundfreibetrag does not look like a tax-rate spike.
            const effectiveLabel = vspInRates
              ? `Effective burden tax + VSP (% of ${basisLabel})`
              : `Effective tax rate (% of ${basisLabel})`
            const marginalLabel = vspInRates
              ? `Marginal burden tax + VSP (% of ${basisName})`
              : `Marginal tax rate (% of ${basisName})`
            const effectiveRate = (point: PapCalculationResult): number | null => {
              const taxPart = investmentInRates ? point.tax : point.payrollTax
              const numerator = vspInRates ? taxPart + actualContributions(point) : taxPart
              const baseDenominator = rateBasis === 'zve' ? point.zve : point.income
              const denominator = investmentInRates
                ? baseDenominator + point.investmentIncome
                : baseDenominator
              if (denominator < 1000) return null
              const rate = (numerator / denominator) * 100
              if (!Number.isFinite(rate) || rate > 100) return null
              return rate
            }
            return [
              {
                label: effectiveLabel,
                data: ratesSeries.map((point) => ({
                  x: salaryToLineDatasetX(point.income),
                  y: effectiveRate(point),
                })) as any,
                borderColor: '#0F766E',
                backgroundColor: '#0F766E',
                borderWidth: 2.5,
                pointRadius: 0,
                tension: 0.25,
                spanGaps: false,
                yAxisID: 'yPercent',
              },
              {
                label: marginalLabel,
                data: ratesSeries.map((point, index) => ({
                  x: salaryToLineDatasetX(point.income),
                  y: marginalRates[index],
                })) as any,
                borderColor: '#DC2626',
                backgroundColor: '#DC2626',
                borderWidth: 2.5,
                pointRadius: 0,
                tension: 0.25,
                spanGaps: false,
                yAxisID: 'yPercent',
              },
              {
                label: 'Marginal Reichensteuer (payroll: LSt + Soli + KiSt on 45% slice)',
                data: ratesSeries.map((point, index) => ({
                  x: salaryToLineDatasetX(point.income),
                  y: marginalReichenPayrollRates[index],
                })) as any,
                borderColor: '#9F1239',
                backgroundColor: '#9F1239',
                borderWidth: 2,
                borderDash: [4, 4],
                pointRadius: 0,
                tension: 0.25,
                spanGaps: false,
                yAxisID: 'yPercent',
              },
            ] satisfies ChartDataset<'line'>[]
          })()
      : mode === 'stacked'
        ? cashStackParts.map((part): ChartDataset<'bar'> => ({
            label: part.label,
            data: series.map((point) => part.value(point)),
            stack: 'total',
            borderColor: part.color,
            backgroundColor: part.color,
            borderWidth: 0,
            borderSkipped: false,
            barPercentage: 1,
            categoryPercentage: 1,
            yAxisID: 'y',
          }))
        : mode === 'decomposition'
          ? (() => {
              type Layer = { key: keyof Omit<MarginalDecomposition, 'total' | 'incomeTaxRaw'>; label: string; color: string }
              const layers: Layer[] = [
                { key: 'incomeTax', label: 'Income tax', color: '#047857' },
                { key: 'reichenTariff', label: 'Reichensteuer (45%)', color: '#9F1239' },
                { key: 'soli', label: 'Solidaritätszuschlag', color: '#DC2626' },
                { key: 'church', label: 'Church tax', color: '#BE123C' },
                { key: 'pension', label: 'Pension (RV)', color: '#4F46E5' },
                { key: 'healthCare', label: 'Health + care (KV+PV)', color: '#9333EA' },
                { key: 'unemployment', label: 'Unemployment (AV)', color: '#0891B2' },
              ]
              // Drop layers that are zero across the whole range so the
              // legend doesn't show greyed-out items (e.g. church tax when
              // the user has churchRate=0).
              const activeLayers = layers.filter((layer) =>
                decompositionRates.some((parts) => Math.abs(parts[layer.key]) > 1e-6),
              )
              return activeLayers.map((layer): ChartDataset<'line'> => ({
                label: layer.label,
                data: ratesSeries.map((point, index) => ({
                  x: salaryToLineDatasetX(point.income),
                  y: decompositionRates[index]?.[layer.key] ?? 0,
                })) as any,
                borderColor: layer.color,
                backgroundColor: layer.color + 'CC',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.25,
                fill: true,
                stack: 'decomposition',
                yAxisID: 'yPercent',
              }))
            })()
        : (() => {
            const canSplitSocial =
              marriedSocialSplit &&
              settings.filing === 'married' &&
              series.some((p) => p.marriedEarners != null)
            return lineMetrics.flatMap((config): ChartDataset<'line'>[] => {
              if (canSplitSocial && METRICS_WITH_MARRIED_SOCIAL_SPLIT.includes(config.key)) {
                return [
                  {
                    label: `${config.label} · earner 1`,
                    data: series.map((point) => ({
                      x: salaryToLineDatasetX(point.income),
                      y: point.marriedEarners
                        ? earnerMetricValue(config.key, point.marriedEarners[0])
                        : config.value(point),
                    })) as any,
                    borderColor: config.color,
                    backgroundColor: config.color,
                    borderWidth: config.key === 'tax' ? 3 : 2,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    tension: 0.18,
                    yAxisID: 'y',
                  },
                  {
                    label: `${config.label} · earner 2`,
                    data: series.map((point) => ({
                      x: salaryToLineDatasetX(point.income),
                      y: point.marriedEarners
                        ? earnerMetricValue(config.key, point.marriedEarners[1])
                        : 0,
                    })) as any,
                    borderColor: config.color + 'AA',
                    backgroundColor: config.color + 'AA',
                    borderWidth: 2,
                    borderDash: [2, 3],
                    pointRadius: 0,
                    tension: 0.18,
                    yAxisID: 'y',
                  },
                ]
              }
              return [
                {
                  label: config.label,
                  data: series.map((point) => ({
                    x: salaryToLineDatasetX(point.income),
                    y: config.value(point),
                  })) as any,
                  borderColor: config.color,
                  backgroundColor: config.color,
                  borderWidth: config.key === 'tax' ? 3 : 2,
                  pointRadius: 0,
                  tension: 0.18,
                  yAxisID: 'y',
                },
              ]
            })
          })(),
  }

  const chartLayoutBottomPad = 8

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      // Keep small: rug labels sit just above ticks; large padding steals chartArea height.
      padding: { bottom: chartLayoutBottomPad },
    },
    interaction: {
      mode: 'nearest' as const,
      intersect: false,
    },
    plugins: {
      selectedIncomeLine: {
        income: currentIncome,
        selectedIndex: mode === 'stacked' || mode === 'percent' ? selectedIndex : undefined,
        selectedXCoordinate: percentileScaleXActive
          ? individualIncomePercentileDeStatis(Math.max(0, currentIncome))
          : undefined,
      },
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          title: (tooltipItems: { parsed: { x?: number }; label?: string }[]) => {
            if (mode === 'stacked' || mode === 'percent') {
              return tooltipItems[0]?.label ?? ''
            }
            const xv = tooltipItems[0]?.parsed?.x
            if (xv == null || !Number.isFinite(xv)) return ''
            if (percentileScaleXActive) {
              const g = grossAtDeStatisPercentile(xv)
              return `p${Number(xv).toFixed(1)} (${formatEuro(Math.round(g))} nominal FT median curve)`
            }
            return formatEuro(xv)
          },
          label: (context: any) => {
            const raw = context.raw
            const value = typeof raw === 'number' ? raw : context.parsed.y
            return mode === 'percent' || mode === 'rates' || mode === 'decomposition'
              ? `${context.dataset.label}: ${formatPercent(value)}`
              : `${context.dataset.label}: ${formatEuro(value)}`
          },
        },
      },
    },
    scales: {
      x: {
        type: isCategoryX ? ('category' as const) : ('linear' as const),
        title: {
          display: true,
          text: isCategoryX
            ? 'Salary income / RE4 (EUR)'
            : percentileScaleXActive
              ? `Destatis FT wage percentile (rank p); horizontal spacing uniform in percentile — ${PRIVILEGE_INCOME_SOURCE_LABEL}`
              : 'Salary income / RE4 (EUR)',
        },
        stacked: mode === 'stacked' || mode === 'percent',
        min: isCategoryX
          ? undefined
          : percentileScaleXActive
            ? lineXPercentileBounds.minP
            : settings.rangeMin,
        max: isCategoryX ? undefined : percentileScaleXActive ? lineXPercentileBounds.maxP : settings.rangeMax,
        grid: {
          display: !isCategoryX,
          drawBorder: true,
        },
        ticks: isCategoryX
          ? {
              maxTicksLimit: 8,
              autoSkip: true,
              autoSkipPadding: 12,
              callback: (value: string | number) => {
                const tickValue = series[Number(value)]?.income ?? value
                return Number(tickValue).toLocaleString()
              },
            }
          : percentileScaleXActive
            ? {
                maxTicksLimit: 10,
                autoSkip: true,
                autoSkipPadding: 20,
                maxRotation: 45,
                minRotation: 0,
                callback: (value: string | number) => {
                  const v = Number(value)
                  if (!Number.isFinite(v)) return String(value)
                  const g = Math.round(grossAtDeStatisPercentile(v))
                  return `p${Math.round(v)} (~${formatCompactSalaryAxisEur(g)})`
                },
              }
            : {
                maxTicksLimit: 8,
                autoSkip: true,
                autoSkipPadding: 12,
                callback: (value: string | number) => Number(value).toLocaleString(),
              },
      },
      y: {
        display: mode !== 'percent' && mode !== 'rates' && mode !== 'decomposition',
        title: {
          display: true,
          text: mode === 'stacked' ? 'Income composition (EUR)' : 'Selected metric value (EUR)',
        },
        stacked: mode === 'stacked',
        min: mode === 'stacked' || mode === 'lines' ? 0 : undefined,
        max: mode === 'stacked' || mode === 'lines' ? stableEuroYMax : undefined,
        ticks: {
          callback: (value: string | number) => `EUR ${Number(value).toLocaleString()}`,
        },
      },
      yPercent: {
        display: mode === 'percent' || mode === 'rates' || mode === 'decomposition',
        position: 'right' as const,
        stacked: mode === 'percent' || mode === 'decomposition',
        title: {
          display: true,
          text: mode === 'rates'
            ? 'Tax rate (%)'
            : mode === 'decomposition'
              ? 'Marginal burden decomposition (%)'
              : 'Share of income composition (%)',
        },
        min: 0,
        max:
          mode === 'percent'
            ? 100
            : mode === 'rates' || mode === 'decomposition'
              ? 90
              : undefined,
        ticks: {
          callback: (value: string | number) => `${Number(value).toFixed(1)}%`,
        },
      },
    },
  }

  // Chart.js often fails to refresh stacked/category bar data when only values
  // change; include year (and mode) in the key so toggling tax year remounts.
  const chartInstanceKey = `${mode}-${settings.year}-${settings.stkl}-${settings.filing}-${marriedSocialSplit}-${percentileAxis}-${percentileScaleXActive}`

  const reichenChartNote = React.useMemo(() => {
    const papProbe = toPapOptions(settings)
    const yr = papProbe.year ?? settings.year
    const kzt =
      settings.filing === 'married' ? TARIFF_KZTAB_DUAL_EARNER_HOUSEHOLD : tariffKztabRe4SweepPath(papProbe)
    return {
      kzt,
      zveAtKnotEur: minZVeFloorForTariffTopBracket(kzt, yr),
      xKnot: reichenTariffXThresholdForYear(yr),
    }
  }, [settings])

  const marriedScatterNote = settings.filing === 'married' ? (
    <em className="chart-percentile-caption__note">
      Scatter x uses household RE4; Destatis percentile reference is individual full-time wages.
    </em>
  ) : null

  return (
    <section className="chart-panel">
      {percentileScaleXActive ? (
        <p className="chart-percentile-caption">
          <strong>Percentile x-axis:</strong> horizontal spacing is proportional to percentile rank ({PRIVILEGE_INCOME_SOURCE_LABEL}
          spline), so each percentile occupies equal width regardless of uneven EUR spacing. Hover shows approximate nominal
          gross from the inverse curve.{' '}
          {marriedScatterNote}
        </p>
      ) : null}
      <p className="chart-percentile-caption">
        Rug ticks: {PRIVILEGE_INCOME_SOURCE_LABEL} — only published cutoffs (p10–p90 deciles and p99; no interpolated p91–p98).
        Last tabulated wage percentile is{' '}
        <strong>p99 ≈ EUR {DESTATIS_FULLTIME_WAGE_P99_MAX_EUR_2024.toLocaleString('de-DE')}</strong>; the salary axis can extend beyond
        that (typically to EUR {settings.rangeMax.toLocaleString('de-DE')} here) so the{' '}
        <strong>45&nbsp;% marginal tariff (often called Reichensteuer)</strong> appears — that extension is <strong>not</strong> any Destatis percentile
        (“p100”).{' '}
        The automatic chart maximum is additionally <strong>clamped:</strong> it <strong>cannot exceed</strong> EUR {MAX_CHART_SALARY_EUR.toLocaleString('de-DE')} (performance / numerics ceiling); routine scenarios stay far below that limit.
        <br />
        <span className="chart-percentile-caption__note">
          <strong>ZVE vs Reichensteuer:</strong> each point’s ZVE line is the <strong>tax base</strong> (gross minus ZTABFB/VSP …). The plotted
          Reichensteuer EUR slices are <strong>parts of payroll Lohnsteuer + proportional Soli/KiSt</strong> from the tariff on that base — they are{' '}
          <strong>not</strong> stacked on top of ZVE and <strong>do not</strong> double‑count it.
          Under your current inputs, the statutory knot is{' '}
          <strong>
            X = ⌊ZVE / KZTAB⌋ ≥ {reichenChartNote.xKnot.toLocaleString('de-DE')}
          </strong>{' '}
          with <strong>KZTAB = {reichenChartNote.kzt}</strong> on this path (full PAP options: year, children, STKL, VSP/PKV, Soli/KiSt, …), so the
          taxable-income floor for that block is about <strong>EUR {reichenChartNote.zveAtKnotEur.toLocaleString('de-DE')}</strong> — the gross RE4
          where you first hit it still moves with every scenario.
        </span>
        {percentileScaleXActive ? (
          <> Rugs align vertically with the percentile grid.</>
        ) : null}{' '}
        {!percentileScaleXActive && marriedScatterNote ? (
          <em className="chart-percentile-caption__note">
            X-axis is household RE4 here; rugs still use the individual FT distribution for reference.
          </em>
        ) : null}
        {mode === 'rates' && rateBasis === 'zve' ? (
          <>
            <br />
            <span className="chart-percentile-caption__note">
              <strong>Rates · Per ZVE:</strong> the <strong>effective burden</strong> line uses payroll tax plus employee social (<strong>cash</strong>)
              contributions in the numerator, but divides by <strong>ZVE</strong>, which already subtracts deductible VSP. Around the statutory{' '}
              <strong>contribution ceilings (BBG)</strong>, social euros (and deductible VSP) stop growing much with gross while ZVE can still climb almost
              euro‑for‑euro — so this <strong>constructed average</strong> can <strong>bend downward</strong> for a spell; the same dip is usually weaker on{' '}
              <strong>per gross</strong> because each extra gross euro always adds exactly one euro to that denominator.
              {!vspInRates ? (
                <>
                  {' '}
                  Include <strong>VSP in tax rates</strong> in chart controls when you want the numerator to mirror take-home burdens (otherwise social sits
                  out of that effective line).
                </>
              ) : null}
            </span>
            <span className="chart-percentile-caption__formula">
              <strong>Effective burden % (per ZVE, this app):</strong>{' '}
              <code>
                100 × (numerator ÷ denominator)
              </code>
              <br />
              <code>numerator</code> ={' '}
              {investmentInRates ? (
                <>
                  <code>tax</code> (payroll + capital-gains stack)
                </>
              ) : (
                <>
                  <code>payrollTax</code> (LSt + Soli + KiSt on wages)
                </>
              )}
              {vspInRates ? (
                <>
                  {' '}
                  + <code>vspRenten + vspKrankenPflege + vspArbeitslosen</code>
                </>
              ) : (
                <> (no social in numerator)</>
              )}
              <br />
              <code>denominator</code> = <code>zve</code>
              {investmentInRates ? (
                <>
                  {' '}
                  + <code>investmentIncome</code>
                </>
              ) : null}
              . Values are taken from each PAP point along the x-axis; points with denominator &lt; 1&nbsp;000 EUR or rate &gt; 100&nbsp;% are omitted.
            </span>
          </>
        ) : null}
      </p>
      <div className="tax-chart-canvas-host">
        {mode === 'stacked' || mode === 'percent'
          ? <Bar key={chartInstanceKey} data={data as any} options={options} plugins={chartPlugins} />
          : <Line key={chartInstanceKey} data={data as any} options={options} plugins={chartPlugins} />}
      </div>
    </section>
  )
}
