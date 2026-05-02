import React from 'react'
import { Bar } from 'react-chartjs-2'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import type { PapExplorerSettings } from './TaxInput'
import {
  computePercentileTaxContributionByDecile,
  type PercentileTaxContributionMetric,
} from '../lib/percentile_tax_contribution'

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip, Legend)

function formatEurRounded(n: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

const METRIC_OPTS: ReadonlyArray<{ value: PercentileTaxContributionMetric; label: string }> = [
  { value: 'taxPlusEmployeeSocial', label: 'Income tax + employee social contributions' },
  { value: 'payrollTax', label: 'Payroll income tax only (LSt + Soli + Kirchen + Kapitalteil)' },
]

/** Low wage decile → pale slate; high decile → deep blue‑green. */
function fillForWageDecile(decileIndex: number): string {
  const t = (decileIndex - 1) / 9
  const r = Math.round(229 + (45 - 229) * t)
  const g = Math.round(237 + (85 - 237) * t)
  const b = Math.round(247 + (115 - 247) * t)
  return `rgb(${r},${g},${b})`
}

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

export default function PercentileTaxContributionChart({ explorer }: { explorer: PapExplorerSettings }) {
  const [metric, setMetric] = React.useState<PercentileTaxContributionMetric>('taxPlusEmployeeSocial')

  const model = React.useMemo(() => computePercentileTaxContributionByDecile(explorer, metric), [explorer, metric])
  const { buckets, totalTaxEUR } = model

  const sharePct = React.useMemo(() => buckets.map((b) => b.shareOfTotal * 100), [buckets])
  const maxSharePct = sharePct.reduce((m, x) => Math.max(m, x), 0)

  const compareYLim = React.useMemo(
    () => roundUpToStep(Math.max(maxSharePct * 1.12, maxSharePct + 3), 1),
    [maxSharePct],
  )

  const stackData = React.useMemo(
    () => ({
      labels: ['Sum of modeled tax = 100%'],
      datasets: buckets.map((b) => ({
        label: `D${b.decileIndex} (${b.label})`,
        data: [b.shareOfTotal * 100],
        backgroundColor: fillForWageDecile(b.decileIndex),
        borderColor: '#ffffff',
        borderWidth: 1.75,
        borderSkipped: false,
        stack: 'tax',
      })),
    }),
    [buckets],
  )

  const stackOptions = React.useMemo(
    () => ({
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest' as const,
        intersect: false,
        axis: 'x' as const,
      },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            font: { size: 11 },
            padding: 8,
          },
        },
        tooltip: {
          animation: false as const,
          mode: 'nearest' as const,
          intersect: false,
          axis: 'x' as const,
          callbacks: {
            title: (items: ReadonlyArray<{ datasetIndex?: number }>) => {
              const i = items[0]?.datasetIndex
              const b = i !== undefined ? buckets[i] : undefined
              return b ? `Wage decile ${b.decileIndex} (${b.label} on FT spline)` : ''
            },
            label: (ctx: { datasetIndex?: number }) => {
              const i = ctx.datasetIndex
              if (i === undefined || i < 0) return ''
              const b = buckets[i]
              if (!b) return ''
              return [
                `${(b.shareOfTotal * 100).toFixed(2)} % of the modeled total`,
                `${formatEurRounded(b.sumTaxEUR)} summed in this decile`,
              ]
            },
          },
        },
      },
      datasets: {
        bar: {
          barThickness: 54,
          maxBarThickness: 66,
        },
      },
      scales: {
        x: {
          stacked: true,
          min: 0,
          max: 100,
          grid: { color: '#eef2f6' },
          ticks: {
            stepSize: 10,
            callback: (v: string | number) => `${Math.round(Number(v))} %`,
          },
          title: {
            display: true,
            text: '% of modeled total tax — composition (lower wage ← → higher wage)',
          },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { display: false },
          display: false,
        },
      },
    }),
    [buckets],
  )

  const compareData = React.useMemo(
    () => ({
      labels: buckets.map((b) => `D${b.decileIndex}`),
      datasets: [
        {
          label: '% of modeled total',
          data: sharePct,
          backgroundColor: buckets.map((b) => fillForWageDecile(b.decileIndex)),
          borderColor: '#ffffff',
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.92,
          categoryPercentage: 0.88,
        },
      ],
    }),
    [buckets, sharePct],
  )

  const compareOptions = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          animation: false as const,
          callbacks: {
            title: (items: ReadonlyArray<{ dataIndex: number }>) => {
              const i = items[0]?.dataIndex
              const b = i !== undefined ? buckets[i] : undefined
              return b ? `Decile ${b.decileIndex} (${b.label} on spline)` : ''
            },
            label: (ctx: { parsed?: { y?: number }; dataIndex?: number }) => {
              const i = ctx.dataIndex
              const y = ctx.parsed?.y
              const b = i !== undefined ? buckets[i] : undefined
              if (!b || typeof y !== 'number') return ''
              return [
                `${y.toFixed(2)} % of modeled total`,
                `${formatEurRounded(b.sumTaxEUR)} summed in this decile`,
              ]
            },
          },
        },
      },
      datasets: {
        bar: {},
      },
      scales: {
        x: {
          grid: { display: false },
          title: { display: true, text: 'Wage‑income decile (same colours as composition bar)' },
        },
        y: {
          beginAtZero: true,
          suggestedMax: compareYLim,
          grid: { color: '#eef2f6' },
          ticks: {
            callback: (v: string | number) => `${Number(v).toFixed(0)} %`,
            stepSize:
              compareYLim > 24 ? 5 : compareYLim > 14 ? 2 : 1,
          },
          title: {
            display: true,
            text: '% of modeled total tax (easier cross‑decile comparison)',
          },
        },
      },
    }),
    [buckets, compareYLim],
  )

  const key = `${explorer.year}-${explorer.kvz}-${explorer.pkv}-${metric}-${explorer.investmentIncome}`

  const massSumPct = buckets.reduce((a, b) => a + b.shareOfTotal, 0) * 100

  return (
    <details className="percentile-tax-panel" aria-labelledby="pct-tax-share-heading">
      <summary className="tax-dist-sim-expand-summary" id="pct-tax-share-heading">
        Tax shares by wage decile (illustrative)
      </summary>
      <div className="tax-dist-sim-details-body">
        <p className="chart-percentile-caption chart-percentile-caption--muted">
          Two views of the <strong>same decile percentages</strong>. The <strong>stacked strip</strong> shows how modeled
          tax adds to 100 % (wage deciles on the spline, D10 = p91–99). The <strong>comparison chart</strong> lines the same
          numbers up against a shared zero baseline so contrasts between richer and poorer spline bands jump out —
          deliberately <strong>without</strong> a “flat 10 %” guide: putting “10 % of people per decile” on a{' '}
          <strong>share‑of‑tax</strong> axis suggests a causal benchmark that progression breaks. Neutral earner, rank weights
          1–99, your explorer options.
        </p>
        <div className="tax-dist-sim-controls">
          <label className="tax-dist-sim-label">
            What to aggregate
            <select value={metric} onChange={(e) => setMetric(e.target.value as PercentileTaxContributionMetric)}>
              {METRIC_OPTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <dl className="tax-dist-sim-stats results-dl">
          <dt>Modeled summed total (99 ranks, {metric === 'payrollTax' ? 'payroll tax' : 'tax + SSC'})</dt>
          <dd>{totalTaxEUR > 0 ? formatEurRounded(totalTaxEUR) : '0 €'}</dd>
          <dt>Mass check</dt>
          <dd>{massSumPct.toFixed(2)}{' % '}across decile segments</dd>
        </dl>
        <h3 className="tax-dist-sim-chart-subheading">Composition — adds to 100 %</h3>
        <div className="percentile-tax-decile-stack-host">
          <Bar key={`${key}-stack`} data={stackData as any} options={stackOptions as any} />
        </div>
        <h3 className="tax-dist-sim-chart-subheading" id="pct-tax-decile-compare-heading">
          Comparison — bars share one axis
        </h3>
        <p className="chart-percentile-caption chart-percentile-caption--muted">
          Hover for decile € mass and modeled share of the total — no bogus population parity ruler.
        </p>
        <div className="percentile-tax-decile-compare-host" aria-labelledby="pct-tax-decile-compare-heading">
          <Bar key={`${key}-compare`} data={compareData as any} options={compareOptions as any} />
        </div>
      </div>
    </details>
  )
}
