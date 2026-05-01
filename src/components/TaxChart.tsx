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
import { PapCalculationResult } from '../lib/pap'

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

export const CHART_METRICS: Array<{ key: ChartMetric; label: string; color: string }> = [
  { key: 'tax', label: 'Tax', color: '#0F766E' },
  { key: 'zve', label: 'ZVE', color: '#2563EB' },
  { key: 'vsp', label: 'VSP', color: '#7C3AED' },
  { key: 'ztabfb', label: 'ZTABFB', color: '#EA580C' },
  { key: 'wvfrb', label: 'WVFRB', color: '#0891B2' },
  { key: 'baseTax', label: 'Base tax', color: '#DC2626' },
  { key: 'vspRenten', label: 'Pension', color: '#4F46E5' },
  { key: 'vspKrankenPflege', label: 'Health/care', color: '#9333EA' },
  { key: 'vspArbeitslosen', label: 'Unemployment', color: '#D97706' },
]

export type ChartMode = 'lines' | 'stacked'

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
    key: 'remaining',
    label: 'Remaining wage',
    color: '#64748B',
    value: (point) => Math.max(0, point.income - point.tax - point.vsp - point.ztabfb),
  },
]

function metricConfig(metric: ChartMetric) {
  return CHART_METRICS.find((item) => item.key === metric) ?? CHART_METRICS[0]
}

function formatEuro(value: number) {
  return `EUR ${Number(value).toLocaleString()}`
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
}: {
  series: PapCalculationResult[]
  currentIncome: number
  metrics: ChartMetric[]
  mode: ChartMode
}) {
  let selectedIndex = 0
  for (let i = 0; i < series.length; i++) {
    if (Math.abs(series[i].income - currentIncome) < Math.abs(series[selectedIndex]?.income - currentIncome)) selectedIndex = i
  }

  const data = {
    labels: mode === 'stacked' ? series.map((point) => point.income) : undefined,
    datasets: mode === 'stacked'
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
          data: series.map((point) => ({ x: point.income, y: point[metric] })),
          borderColor: config.color,
          backgroundColor: config.color,
          borderWidth: metric === 'tax' ? 3 : 2,
          pointRadius: 0,
          tension: 0.18,
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
        selectedIndex: mode === 'stacked' ? selectedIndex : undefined,
      },
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const raw = context.raw
            const value = Array.isArray(raw?.y) ? raw.y[1] - raw.y[0] : context.parsed.y
            return `${context.dataset.label}: ${formatEuro(value)}`
          },
        },
      },
    },
    scales: {
      x: {
        type: mode === 'stacked' ? 'category' as const : 'linear' as const,
        title: { display: true, text: 'Gross wage / RE4 (EUR)' },
        ticks: {
          maxTicksLimit: 7,
          callback: (value: string | number) => {
            const tickValue = mode === 'stacked'
              ? series[Number(value)]?.income ?? value
              : value
            return Number(tickValue).toLocaleString()
          },
        },
      },
      y: {
        title: { display: true, text: 'EUR' },
        ticks: {
          callback: (value: string | number) => Number(value).toLocaleString(),
        },
      },
    },
  }

  return (
    <section className="chart-panel">
      {mode === 'stacked'
        ? <Bar data={data as any} options={options} plugins={[selectedIncomePlugin]} />
        : <Line data={data as any} options={options} plugins={[selectedIncomePlugin]} />}
    </section>
  )
}
