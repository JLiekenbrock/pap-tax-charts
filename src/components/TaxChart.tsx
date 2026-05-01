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
import { PapCalculationResult, PapOptions, calculatePapResultFromRE4 } from '../lib/pap'
import {
  MarginalDecomposition,
  RateBasis,
  actualContributions,
  marginalDecomposition,
  marginalTaxRate,
  ratePercent,
} from '../lib/rates'
import { PapExplorerSettings } from './TaxInput'

function toPapOptions(settings: PapExplorerSettings): PapOptions {
  const {
    income: _income,
    income1: _income1,
    income2: _income2,
    rangeMin: _rangeMin,
    rangeMax: _rangeMax,
    points: _points,
    includeKindergeld: _includeKindergeld,
    kindergeldChildren: _kindergeldChildren,
    ...rest
  } = settings
  void _income; void _income1; void _income2; void _rangeMin; void _rangeMax; void _points; void _includeKindergeld; void _kindergeldChildren
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

const selectedIncomePlugin = {
  id: 'selectedIncomeLine',
  afterDatasetsDraw(chart: ChartJS, _args: unknown, pluginOptions: { income?: number; selectedIndex?: number }) {
    const income = pluginOptions.income
    if (income == null || !Number.isFinite(income)) return

    const { ctx, chartArea, scales } = chart
    const xScale = scales.x
    if (!xScale || !chartArea) return

    const selectedIndex = pluginOptions.selectedIndex
    const x = typeof selectedIndex === 'number'
      ? xScale.getPixelForValue(selectedIndex)
      : xScale.getPixelForValue(income)
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
}: {
  series: PapCalculationResult[]
  currentIncome: number
  metrics: ChartMetric[]
  mode: ChartMode
  settings: PapExplorerSettings
  rateBasis: RateBasis
  vspInRates: boolean
  vspInComposition: boolean
}) {
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
        label: 'VSP',
        color: '#7C3AED',
        value: (point) => Math.max(0, point.vsp),
      })
    }
    parts.push({
      key: 'usableSalary',
      label: 'Usable salary',
      color: '#64748B',
      value: (point) => Math.max(0, point.income - point.payrollTax - (vspInComposition ? point.vsp : 0)),
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

  let selectedIndex = 0
  for (let i = 0; i < series.length; i++) {
    if (Math.abs(series[i].income - currentIncome) < Math.abs(series[selectedIndex]?.income - currentIncome)) selectedIndex = i
  }
  const ratesSeries = React.useMemo(() => {
    if (mode !== 'rates' && mode !== 'decomposition') return series
    if (series.length === 0) return series
    const minIncome = series[0].income
    const maxIncome = series[series.length - 1].income
    const interval = 1000
    const opts = toPapOptions(settings)
    const points: PapCalculationResult[] = []
    for (let income = minIncome; income <= maxIncome; income += interval) {
      points.push(calculatePapResultFromRE4(income, opts))
    }
    if (points[points.length - 1]?.income !== maxIncome) {
      points.push(calculatePapResultFromRE4(maxIncome, opts))
    }
    return points
  }, [mode, series, settings])

  const decompositionRates = React.useMemo(() => {
    if (mode !== 'decomposition') return [] as MarginalDecomposition[]
    const opts = toPapOptions(settings)
    return ratesSeries.map((point) => marginalDecomposition(point.income, opts, rateBasis))
  }, [mode, ratesSeries, settings, rateBasis])

  const marginalRates = React.useMemo(() => {
    if (mode !== 'rates') return [] as (number | null)[]
    const opts = toPapOptions(settings)
    // Use null for points with too small a denominator so the chart skips them
    // instead of showing huge spikes (same logic as ratePercent).
    const raw = ratesSeries.map((point) => {
      const denom = rateBasis === 'zve' ? point.zve : point.income
      if (denom < 1000) return null
      return marginalTaxRate(point.income, opts, rateBasis, { includeVspInRate: vspInRates })
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
            const basisLabel = rateBasis === 'zve' ? 'ZVE' : 'salary'
            // When VSP is in the numerator we're plotting the combined burden,
            // not just tax. Make that explicit so a non-zero value below the
            // Grundfreibetrag does not look like a tax-rate spike.
            const effectiveLabel = vspInRates
              ? `Effective burden tax + VSP (% of ${basisLabel})`
              : `Effective tax rate (% of ${basisLabel})`
            const marginalLabel = vspInRates
              ? `Marginal burden tax + VSP (% of ${basisLabel})`
              : `Marginal tax rate (% of ${basisLabel})`
            return [
              {
                label: effectiveLabel,
                data: ratesSeries.map((point) => ({
                  x: point.income,
                  y: ratePercent(
                    point,
                    vspInRates ? point.payrollTax + actualContributions(point) : point.payrollTax,
                    rateBasis,
                  ),
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
        : lineMetrics.map((config): ChartDataset<'line'> => {
        return {
          label: config.label,
          data: series.map((point) => ({ x: point.income, y: config.value(point) })),
          borderColor: config.color,
          backgroundColor: config.color,
          borderWidth: config.key === 'tax' ? 3 : 2,
          pointRadius: 0,
          tension: 0.18,
          yAxisID: 'y',
        }
      }),
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
        type: mode === 'stacked' || mode === 'percent' ? 'category' as const : 'linear' as const,
        title: { display: true, text: 'Salary income / RE4 (EUR)' },
        stacked: mode === 'stacked' || mode === 'percent',
        grid: {
          display: mode !== 'stacked' && mode !== 'percent',
          drawBorder: true,
        },
        ticks: {
          maxTicksLimit: 7,
          autoSkip: true,
          autoSkipPadding: 12,
          callback: (value: string | number) => {
            const tickValue = mode === 'stacked' || mode === 'percent'
              ? series[Number(value)]?.income ?? value
              : value
            return Number(tickValue).toLocaleString()
          },
        },
      },
      y: {
        display: mode !== 'percent' && mode !== 'rates' && mode !== 'decomposition',
        title: {
          display: true,
          text: mode === 'stacked' ? 'Income composition (EUR)' : 'Selected metric value (EUR)',
        },
        stacked: mode === 'stacked',
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
        max: mode === 'percent' ? 100 : undefined,
        suggestedMax: mode === 'rates' || mode === 'decomposition' ? 60 : undefined,
        ticks: {
          callback: (value: string | number) => `${Number(value).toFixed(1)}%`,
        },
      },
    },
  }

  return (
    <section className="chart-panel">
      {mode === 'stacked' || mode === 'percent'
        ? <Bar key={`bar-${mode}`} data={data as any} options={options} plugins={[selectedIncomePlugin]} />
        : <Line key={`line-${mode}`} data={data as any} options={options} plugins={[selectedIncomePlugin]} />}
    </section>
  )
}
