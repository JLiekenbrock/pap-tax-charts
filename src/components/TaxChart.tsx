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
import { PapCalculationResult, calculatePapResultFromRE4 } from '../lib/pap'
import { PapExplorerSettings } from './TaxInput'

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

function wagePercent(point: PapCalculationResult, value: number) {
  return point.income > 0 ? (value / point.income) * 100 : 0
}

export const CHART_METRICS: MetricConfig[] = [
  { key: 'tax', label: 'Tax', color: '#0F766E', unit: 'eur', value: (point) => point.tax },
  { key: 'zve', label: 'ZVE', color: '#2563EB', unit: 'eur', value: (point) => point.zve },
  { key: 'vsp', label: 'VSP', color: '#7C3AED', unit: 'eur', value: (point) => point.vsp },
  { key: 'ztabfb', label: 'ZTABFB', color: '#EA580C', unit: 'eur', value: (point) => point.ztabfb },
  { key: 'wvfrb', label: 'WVFRB', color: '#0891B2', unit: 'eur', value: (point) => point.wvfrb },
  { key: 'baseTax', label: 'Base tax', color: '#DC2626', unit: 'eur', value: (point) => point.baseTax },
  { key: 'vspRenten', label: 'Pension', color: '#4F46E5', unit: 'eur', value: (point) => point.vspRenten },
  { key: 'vspKrankenPflege', label: 'Health/care', color: '#9333EA', unit: 'eur', value: (point) => point.vspKrankenPflege },
  { key: 'vspArbeitslosen', label: 'Unemployment', color: '#D97706', unit: 'eur', value: (point) => point.vspArbeitslosen },
]

const PERCENT_METRICS: MetricConfig[] = [
  { key: 'tax', label: 'Tax %', color: '#0F766E', unit: 'percent', value: (point) => wagePercent(point, point.tax) },
  { key: 'vsp', label: 'VSP %', color: '#7C3AED', unit: 'percent', value: (point) => wagePercent(point, point.vsp) },
  {
    key: 'zve',
    label: 'Remaining %',
    color: '#64748B',
    unit: 'percent',
    value: (point) => Math.max(0, 100 - wagePercent(point, point.tax) - wagePercent(point, point.vsp)),
  },
]

export type ChartMode = 'lines' | 'stacked' | 'percent' | 'rates'
export type RateBasis = 'gross' | 'zve'

const STACKED_PARTS: Array<{
  key: string
  label: string
  color: string
  value: (point: PapCalculationResult) => number
}> = [
  { key: 'tax', label: 'Tax', color: '#0F766E', value: (point) => point.tax },
  { key: 'vsp', label: 'VSP', color: '#7C3AED', value: (point) => point.vsp },
  { key: 'ztabfb', label: 'Allowances', color: '#EA580C', value: (point) => point.ztabfb },
  {
    key: 'netSalary',
    label: 'Net salary',
    color: '#64748B',
    value: (point) => Math.max(0, point.income - point.tax - point.vsp),
  },
]

function metricConfig(metric: ChartMetric) {
  return CHART_METRICS.find((item) => item.key === metric) ?? CHART_METRICS[0]
}

function formatEuro(value: number) {
  return `EUR ${Number(value).toLocaleString()}`
}

function formatPercent(value: number) {
  return `${Number(value).toFixed(2)}%`
}

function marginalTaxRate(point: PapCalculationResult, settings: PapExplorerSettings, basis: RateBasis) {
  const delta = 100
  const lowerIncome = Math.max(0, point.income - delta)
  const upperIncome = point.income + delta
  const lower = calculatePapResultFromRE4(lowerIncome, { ...settings, income: lowerIncome })
  const upper = calculatePapResultFromRE4(upperIncome, { ...settings, income: upperIncome })
  const basisDelta = basis === 'zve' ? upper.zve - lower.zve : upperIncome - lowerIncome
  return basisDelta > 0 ? ((upper.tax - lower.tax) / basisDelta) * 100 : 0
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

export default function TaxChart({
  series,
  currentIncome,
  metrics,
  mode,
  settings,
  rateBasis,
}: {
  series: PapCalculationResult[]
  currentIncome: number
  metrics: ChartMetric[]
  mode: ChartMode
  settings: PapExplorerSettings
  rateBasis: RateBasis
}) {
  let selectedIndex = 0
  for (let i = 0; i < series.length; i++) {
    if (Math.abs(series[i].income - currentIncome) < Math.abs(series[selectedIndex]?.income - currentIncome)) selectedIndex = i
  }
  const ratesSeries = React.useMemo(() => {
    if (mode !== 'rates' || series.length === 0) return series
    const minIncome = series[0].income
    const maxIncome = series[series.length - 1].income
    const interval = 1000
    const points: PapCalculationResult[] = []
    for (let income = minIncome; income <= maxIncome; income += interval) {
      points.push(calculatePapResultFromRE4(income, { ...settings, income }))
    }
    if (points[points.length - 1]?.income !== maxIncome) {
      points.push(calculatePapResultFromRE4(maxIncome, { ...settings, income: maxIncome }))
    }
    return points
  }, [mode, series, settings])

  const data = {
    labels: mode === 'stacked' || mode === 'percent' ? series.map((point) => point.income) : undefined,
    datasets: mode === 'percent'
      ? PERCENT_METRICS.map((config, partIndex): ChartDataset<'bar'> => ({
          label: config.label,
          data: series.map((point) => {
            const previous = PERCENT_METRICS.slice(0, partIndex).reduce((total, item) => total + item.value(point), 0)
            const next = previous + config.value(point)
            return { x: point.income, y: [previous, next] }
          }),
          borderColor: config.color,
          backgroundColor: `${config.color}80`,
          borderWidth: 1,
          barPercentage: 1,
          categoryPercentage: 1,
          yAxisID: 'yPercent',
        }))
      : mode === 'rates'
        ? [
            {
              label: 'Effective tax rate',
              data: ratesSeries.map((point) => ({ x: point.income, y: wagePercent(point, point.tax) })),
              borderColor: '#0F766E',
              backgroundColor: '#0F766E',
              borderWidth: 2.5,
              pointRadius: 0,
              tension: 0.18,
              yAxisID: 'yPercent',
            },
            {
              label: rateBasis === 'zve' ? 'Marginal tax rate / ZVE' : 'Marginal tax rate / gross',
              data: ratesSeries.map((point) => ({ x: point.income, y: marginalTaxRate(point, settings, rateBasis) })),
              borderColor: '#DC2626',
              backgroundColor: '#DC2626',
              borderWidth: 2.5,
              pointRadius: 0,
              tension: 0.12,
              yAxisID: 'yPercent',
            },
          ] satisfies ChartDataset<'line'>[]
      : mode === 'stacked'
        ? STACKED_PARTS.map((part, partIndex): ChartDataset<'bar'> => ({
            label: part.label,
            data: series.map((point) => {
              const previous = STACKED_PARTS.slice(0, partIndex).reduce((total, item) => total + item.value(point), 0)
              const next = previous + part.value(point)
              return { x: point.income, y: [previous, next] }
            }),
            borderColor: part.color,
            backgroundColor: `${part.color}80`,
            borderWidth: 1,
            barPercentage: 1,
            categoryPercentage: 1,
          }))
        : metrics.map((metric): ChartDataset<'line'> => {
        const config = metricConfig(metric)
        return {
          label: config.label,
          data: series.map((point) => ({ x: point.income, y: config.value(point) })),
          borderColor: config.color,
          backgroundColor: config.color,
          borderWidth: metric === 'tax' ? 3 : 2,
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
            const value = Array.isArray(raw?.y) ? raw.y[1] - raw.y[0] : context.parsed.y
            return mode === 'percent' || mode === 'rates'
              ? `${context.dataset.label}: ${formatPercent(value)}`
              : `${context.dataset.label}: ${formatEuro(value)}`
          },
        },
      },
    },
    scales: {
      x: {
        type: mode === 'stacked' || mode === 'percent' ? 'category' as const : 'linear' as const,
        title: { display: true, text: 'Gross wage / RE4 (EUR)' },
        ticks: {
          maxTicksLimit: 7,
          callback: (value: string | number) => {
            const tickValue = mode === 'stacked' || mode === 'percent'
              ? series[Number(value)]?.income ?? value
              : value
            return Number(tickValue).toLocaleString()
          },
        },
      },
      y: {
        display: mode !== 'percent' && mode !== 'rates',
        title: { display: true, text: 'EUR' },
        ticks: {
          callback: (value: string | number) => Number(value).toLocaleString(),
        },
      },
      yPercent: {
        display: mode === 'percent' || mode === 'rates',
        position: 'right' as const,
        title: { display: true, text: mode === 'rates' ? 'Tax rate' : '% of wage' },
        min: 0,
        max: mode === 'percent' || mode === 'rates' ? 100 : undefined,
        ticks: {
          callback: (value: string | number) => `${Number(value).toFixed(1)}%`,
        },
      },
    },
  }

  return (
    <section className="chart-panel">
      {mode === 'stacked' || mode === 'percent'
        ? <Bar data={data as any} options={options} plugins={[selectedIncomePlugin]} />
        : <Line data={data as any} options={options} plugins={[selectedIncomePlugin]} />}
    </section>
  )
}
