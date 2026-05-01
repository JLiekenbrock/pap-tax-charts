import React from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ChartDataset,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
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
  type MarriedEarnerSlice,
} from '../lib/pap'
import {
  MarginalDecomposition,
  RateBasis,
  actualContributions,
  marriedEarnerEmployeeSocial,
  marginalDecomposition,
  marginalTaxRate,
} from '../lib/rates'
import { PapExplorerSettings } from './TaxInput'
import { DESTATIS_CHART_INCOME_RUG_MARKERS_2024, DESTATIS_FULLTIME_WAGE_P100_CHART_MAX_EUR_2024, PRIVILEGE_INCOME_SOURCE_LABEL } from '../lib/privilege_benchmark'
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
  LogarithmicScale,
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

/** Short axis labels for log salary scale (avoids long locale strings colliding at the right). */
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

/** Minimum RE4 on chart when x-axis is logarithmic (must be &gt; 0; 10k avoids wasting width on 1k–10k). */
export const CHART_LOG_SALARY_AXIS_MIN_EUR = 10_000

const selectedIncomePlugin = {
  id: 'selectedIncomeLine',
  afterDatasetsDraw(chart: ChartJS, _args: unknown, pluginOptions: { income?: number; selectedIndex?: number }) {
    const income = pluginOptions.income
    if (income == null || !Number.isFinite(income)) return

    const { ctx, chartArea, scales } = chart
    const xScale = scales.x
    if (!xScale || !chartArea) return

    const selectedIndex = pluginOptions.selectedIndex
    let xValue: number = income
    if (typeof selectedIndex !== 'number' && xScale.type === 'logarithmic') {
      const lo =
        typeof xScale.min === 'number' && Number.isFinite(xScale.min) && xScale.min > 0
          ? xScale.min
          : CHART_LOG_SALARY_AXIS_MIN_EUR
      xValue = Math.max(income, lo)
    }
    const x = typeof selectedIndex === 'number'
      ? xScale.getPixelForValue(selectedIndex)
      : xScale.getPixelForValue(xValue)
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
  showDestatisIncomePercentiles = true,
  showLogScaleX = false,
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
  /** Background bands from Destatis individual full-time gross percentiles (single RE4 x-axis only). */
  showDestatisIncomePercentiles?: boolean
  /** Logarithmic salary (RE4) x-axis for line-style modes only (not stacked/percent bars). */
  showLogScaleX?: boolean
}) {
  const logScaleXActive = showLogScaleX && mode !== 'stacked' && mode !== 'percent'
  const isCategoryX = mode === 'stacked' || mode === 'percent'
  const lineMetrics = React.useMemo(() => {
    const selected = metrics.map((metric) => metricConfig(metric))
    return selected.length ? selected : [metricConfig('tax')]
  }, [metrics])

  const cashStackParts = React.useMemo<StackPart[]>(() => {
    const parts: StackPart[] = [
      { key: 'payrollTax', label: 'Payroll tax', color: '#047857', value: (point) => Math.max(0, point.payrollTax) },
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

  const showPercentileRugs = showDestatisIncomePercentiles

  const categoryIncomesForRugs = React.useMemo(
    () => (mode === 'stacked' || mode === 'percent' ? series.map((p) => p.income) : null),
    [mode, series],
  )

  const clipXMinEur = logScaleXActive
    ? Math.max(CHART_LOG_SALARY_AXIS_MIN_EUR, settings.rangeMin)
    : Math.max(0, Math.min(settings.rangeMin, settings.rangeMax))
  const clipXMaxEur = Math.max(clipXMinEur, settings.rangeMax)

  const incomePercentilePlugin = React.useMemo(
    () =>
      createIncomePercentileRugsPlugin({
        enabled: showPercentileRugs,
        clipXMinEur,
        clipXMaxEur,
        markers: DESTATIS_CHART_INCOME_RUG_MARKERS_2024,
        categoryIncomes: categoryIncomesForRugs,
      }),
    [showPercentileRugs, clipXMinEur, clipXMaxEur, categoryIncomesForRugs],
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
    const minIncome = logScaleXActive
      ? Math.max(CHART_LOG_SALARY_AXIS_MIN_EUR, settings.rangeMin)
      : Math.max(0, settings.rangeMin)
    const maxIncome = Math.max(minIncome, settings.rangeMax)
    const interval = 1000
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
  }, [mode, series.length, settings, logScaleXActive])

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
                  x: point.income,
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
                data: ratesSeries.map((point, index) => ({ x: point.income, y: marginalRates[index] })) as any,
                borderColor: '#DC2626',
                backgroundColor: '#DC2626',
                borderWidth: 2.5,
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
              type Layer = { key: keyof Omit<MarginalDecomposition, 'total'>; label: string; color: string }
              const layers: Layer[] = [
                { key: 'incomeTax', label: 'Income tax', color: '#047857' },
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
                  x: point.income,
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
                      x: point.income,
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
                      x: point.income,
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
                  data: series.map((point) => ({ x: point.income, y: config.value(point) })) as any,
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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      // Keep small: rug labels sit just above ticks; large padding steals chartArea height.
      padding: { bottom: showDestatisIncomePercentiles ? 8 : 6 },
    },
    interaction: {
      mode: 'nearest' as const,
      intersect: false,
    },
    plugins: {
      selectedIncomeLine: {
        income: currentIncome,
        selectedIndex: mode === 'stacked' || mode === 'percent' ? selectedIndex : undefined,
      },
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
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
        type: isCategoryX ? ('category' as const) : logScaleXActive ? ('logarithmic' as const) : ('linear' as const),
        title: {
          display: true,
          text: isCategoryX
            ? 'Salary income / RE4 (EUR)'
            : `Salary income / RE4 (EUR)${logScaleXActive ? ', log scale' : ''}`,
        },
        stacked: mode === 'stacked' || mode === 'percent',
        min: isCategoryX ? undefined : logScaleXActive ? Math.max(CHART_LOG_SALARY_AXIS_MIN_EUR, settings.rangeMin) : settings.rangeMin,
        max: isCategoryX ? undefined : settings.rangeMax,
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
          : logScaleXActive
            ? {
                maxTicksLimit: 6,
                autoSkip: true,
                autoSkipPadding: 32,
                maxRotation: 0,
                minRotation: 0,
                callback: (value: string | number) => {
                  const n = Number(value)
                  return Number.isFinite(n) ? formatCompactSalaryAxisEur(n) : String(value)
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
  const chartInstanceKey = `${mode}-${settings.year}-${settings.stkl}-${settings.filing}-${marriedSocialSplit}-${showDestatisIncomePercentiles}-${showPercentileRugs}-${logScaleXActive}`

  return (
    <section className="chart-panel">
      {showDestatisIncomePercentiles ? (
        <p className="chart-percentile-caption">
          Rug ticks: {PRIVILEGE_INCOME_SOURCE_LABEL} — p10 … p80, then each integer p90–p99 (EUR for p91–p98
          linear between published p90/p99). RE4 axis runs to EUR{' '}
          {DESTATIS_FULLTIME_WAGE_P100_CHART_MAX_EUR_2024.toLocaleString()} (Destatis top published percentile,
          used as p100 chart cap).
          {logScaleXActive ? (
            <> X-axis is logarithmic from EUR {CHART_LOG_SALARY_AXIS_MIN_EUR.toLocaleString()}.</>
          ) : null}{' '}
          {settings.filing === 'married' ? (
            <em className="chart-percentile-caption__note">
              X-axis is household RE4 here; rugs still use the individual FT distribution for reference.
            </em>
          ) : null}
        </p>
      ) : logScaleXActive ? (
        <p className="chart-percentile-caption">
          RE4 x-axis: logarithmic scale (domain from EUR {CHART_LOG_SALARY_AXIS_MIN_EUR.toLocaleString()}).
        </p>
      ) : null}
      <div className="tax-chart-canvas-host">
        {mode === 'stacked' || mode === 'percent'
          ? <Bar key={chartInstanceKey} data={data as any} options={options} plugins={chartPlugins} />
          : <Line key={chartInstanceKey} data={data as any} options={options} plugins={chartPlugins} />}
      </div>
    </section>
  )
}
