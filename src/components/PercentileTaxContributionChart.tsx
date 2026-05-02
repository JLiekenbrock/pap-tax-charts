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
import {
  computeDestatisAdjustedGrossMassWeightedPapContribution,
  computeDestatisOfficialAssessedIncomeTaxMassShares,
  officialAssessedIncomeTaxMassShareSumLoMin,
} from '../lib/destatis_mass_tax_contribution'
import { formatDestatisBracketLabel } from '../lib/destatis_income_tax_brackets_2021'

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip, Legend)

export type ContributionVizMode =
  | 'splineEqualRankDeciles'
  | 'destatisOfficialMass2021'
  | 'destatisMassWeightedPap2021'

const MODE_OPTS: ReadonlyArray<{ value: ContributionVizMode; label: string }> = [
  { value: 'splineEqualRankDeciles', label: 'Spline deciles — equal weight ranks 1–99' },
  { value: 'destatisOfficialMass2021', label: 'Destatis 2021 — official band tax mass (tabular)' },
  { value: 'destatisMassWeightedPap2021', label: 'Destatis 2021 — income‑mass × PAP @ band midpoint' },
]

const METRIC_OPTS: ReadonlyArray<{ value: PercentileTaxContributionMetric; label: string }> = [
  { value: 'taxPlusEmployeeSocial', label: 'Income tax + employee social contributions' },
  { value: 'payrollTax', label: 'Payroll income tax only (LSt + Soli + Kirchen + Kapitalteil)' },
]

function formatEurRounded(n: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

function formatMassThousandEur(n: number) {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(n))}\u00a0kEUR (tabular)`
}

function formatEurCompactAbbrev(n: number) {
  return new Intl.NumberFormat('de-DE', {
    notation: 'compact',
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 1,
  }).format(n)
}

function fillSequential(i: number, n: number): string {
  const t = n <= 1 ? 0 : i / (n - 1)
  const r = Math.round(229 + (45 - 229) * t)
  const g = Math.round(237 + (85 - 237) * t)
  const b = Math.round(247 + (115 - 247) * t)
  return `rgb(${r},${g},${b})`
}

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

/** Short x‑axis tick while keeping full wording in legends / tooltips. */
function destatisBracketTick(lo: number, hi: number | null): string {
  const fmt = (v: number) => (v >= 1_000_000 ? `${v / 1_000_000} M` : `${Math.round(v / 1000)} k`)
  if (hi === null) return `≥${fmt(lo)}`
  return `${fmt(lo)}–${fmt(hi)}`
}

type ResolvedBand = {
  key: string
  legend: string
  tick: string
  shareFrac: number
  stackTitle: string
  compareTitle: string
  stackLines: readonly string[]
  compareLines: readonly string[]
}

type ResolvedViz = {
  bands: readonly ResolvedBand[]
  totalLabel: string
  totalValue: string
  massPctCheck: number
  shareLo125Pct?: number
  shareLo250Pct?: number
  stackXCaption: string
  compareYCaption: string
  blurbs: readonly string[]
  legendNote?: string
}

export default function PercentileTaxContributionChart({ explorer }: { explorer: PapExplorerSettings }) {
  const [vizMode, setVizMode] = React.useState<ContributionVizMode>('splineEqualRankDeciles')
  const [metric, setMetric] = React.useState<PercentileTaxContributionMetric>('taxPlusEmployeeSocial')

  const resolved = React.useMemo<ResolvedViz>(() => {
    if (vizMode === 'splineEqualRankDeciles') {
      const { buckets, totalTaxEUR } = computePercentileTaxContributionByDecile(explorer, metric)
      const bands: ResolvedBand[] = buckets.map((b) => ({
        key: `d${b.decileIndex}`,
        legend: `D${b.decileIndex} (${b.label})`,
        tick: `D${b.decileIndex}`,
        shareFrac: b.shareOfTotal,
        stackTitle: `Wage decile ${b.decileIndex} (${b.label} on FT spline)`,
        compareTitle: `Decile ${b.decileIndex} (${b.label})`,
        stackLines: [
          `${(b.shareOfTotal * 100).toFixed(2)} % of modeled total`,
          `${formatEurRounded(b.sumTaxEUR)} summed in this decile`,
        ],
        compareLines: [
          `${(b.shareOfTotal * 100).toFixed(2)} % of modeled total`,
          `${formatEurRounded(b.sumTaxEUR)} summed in this decile`,
        ],
      }))
      return {
        bands,
        totalLabel: `Modeled summed total (99 ranks, ${metric === 'payrollTax' ? 'payroll tax' : 'tax + SSC'})`,
        totalValue: formatEurRounded(totalTaxEUR),
        massPctCheck: buckets.reduce((a, r) => a + r.shareOfTotal, 0) * 100,
        stackXCaption:
          '% of modeled total tax — composition (lower spline wage decile ← higher on the right)',
        compareYCaption: '% of modeled total tax — bar chart for pair‑wise contrasts',
        blurbs: [
          'Neutral earner (single, STKl I), equal mass on each integer wage‑percentile rank 1…99 on the Destatis full‑time spline, rolled into ten deciles (D10 = p91–99).',
          `Metric: ${METRIC_OPTS.find((m) => m.value === metric)?.label ?? metric}. Toy universe — not Finanzamt assessment cohorts.`,
        ],
      }
    }

    if (vizMode === 'destatisOfficialMass2021') {
      const { totalAssessedIncomeTaxMassThousandEur, bands: db } =
        computeDestatisOfficialAssessedIncomeTaxMassShares()
      const bands: ResolvedBand[] = db.map((row) => ({
        key: `${row.lo}-${row.hi ?? 'open'}`,
        legend: row.label,
        tick: destatisBracketTick(row.lo, row.hi),
        shareFrac: row.shareOfOfficialAssessedIncomeTaxMass,
        stackTitle: `Destatis bracket ${row.label}`,
        compareTitle: `Band ${row.label}`,
        stackLines: [
          `${(row.shareOfOfficialAssessedIncomeTaxMass * 100).toFixed(2)} % of official Σ assessed IT mass`,
          `${formatMassThousandEur(row.assessedIncomeTaxMassThousandEur)} — assessed liability`,
          `${formatMassThousandEur(row.adjustedGrossIncomeMassThousandEur)} Σ Einkommen aggregate`,
          `Effective aggregate assessed IT % (tax ÷ Einkommen mass in band): ${row.adjustedGrossIncomeMassThousandEur > 0 ? ((row.assessedIncomeTaxMassThousandEur / row.adjustedGrossIncomeMassThousandEur) * 100).toFixed(2) : '0.00'} %`,
        ],
        compareLines: [
          `${(row.shareOfOfficialAssessedIncomeTaxMass * 100).toFixed(3)} % of Σ assessed IT`,
          `${formatMassThousandEur(row.assessedIncomeTaxMassThousandEur)} tabular tax aggregate`,
        ],
      }))
      return {
        bands,
        totalLabel: 'Official Σ assessed income‑tax aggregate (tabular, thousand‑EUR nominal scale)',
        totalValue: formatMassThousandEur(totalAssessedIncomeTaxMassThousandEur),
        massPctCheck: db.reduce((a, row) => a + row.shareOfOfficialAssessedIncomeTaxMass, 0) * 100,
        shareLo125Pct: officialAssessedIncomeTaxMassShareSumLoMin(125_000) * 100,
        shareLo250Pct: officialAssessedIncomeTaxMassShareSumLoMin(250_000) * 100,
        stackXCaption: '% of published assessed income‑tax mass — Destatis 2021 bands (lower € ← higher)',
        compareYCaption: '% of official assessed income‑tax mass — same algebra as PrivilegeCheck weights',
        blurbs: [
          'Pure spreadsheet algebra from Destatis annual income-tax statistics (2021, embedded table): segmented tax masses match publication aggregates; denominators exclude employee SSC per Destatis wording.',
          'Not a percentile story: bands are coarse and the Steuerpflichtigen universe is wider than “full-time employees only”. Use the lo ≥ 125 k€ / 250 k€ lines at your own risk as shorthand for the upper tail of this table — not “top 10 % of people”.',
        ],
      }
    }

    const weighted = computeDestatisAdjustedGrossMassWeightedPapContribution(explorer, metric)
    const wb = weighted.bands
    const bands: ResolvedBand[] = wb.map((row) => ({
      key: `${row.lo}-${row.hi ?? 'open'}-w`,
      legend: formatDestatisBracketLabel(row),
      tick: destatisBracketTick(row.lo, row.hi),
      shareFrac: row.shareOfTotalWeightedTaxEURScaled,
      stackTitle: `Mass‑weighted ${formatDestatisBracketLabel(row)}`,
      compareTitle: `Band ${formatDestatisBracketLabel(row)}`,
      stackLines: [
        `${(row.shareOfTotalWeightedTaxEURScaled * 100).toFixed(2)} % of Σ weighted modeled tax`,
        `PAP @ proxy ${formatEurRounded(row.proxyArbeitnehmerGrossEUR)} Arbeitnehmer‑brutto (${metric})`,
        `Weight ∝ ${formatMassThousandEur(row.adjustedGrossIncomeMassThousandEur)} Σ Einkommen (1000 € nominal)`,
        `PAP × weight (EUR·1000EUR scale — illustrative): ${new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 3 }).format(row.weightedAnnualTaxEUR)}`,
      ],
      compareLines: [
        `${(row.shareOfTotalWeightedTaxEURScaled * 100).toFixed(3)} % of weighted total`,
        `Midpoint Einkommen ≈ ${formatEurRounded(row.bandMidpointAdjustedGrossEUR)}`,
      ],
    }))
    return {
      bands,
      totalLabel: 'Σ (PAP tax × Destatis Σ‑Einkommen mass) — arbitrary proportional scale',
      totalValue: formatEurCompactAbbrev(weighted.totalWeightedTaxEURScaled),
      massPctCheck: wb.reduce((a, row) => a + row.shareOfTotalWeightedTaxEURScaled, 0) * 100,
      stackXCaption:
        '% of mass‑weighted PAP tax — income bands share Destatis 2021 Σ‑Einkommen weights (left → right)',
      compareYCaption: '% of mass‑weighted modeled tax — explore how PAP + masses concentrate',
      blurbs: [
        'Each bracket: neutral-earner PAP (your explorer year & insurance knobs) evaluated at an illustrative assessment-income midpoint mapped to Arbeitnehmer‑brutto, multiplied by Destatis Σ Einkommen mass in that band.',
        'The weighted product inherits two crude proxies — compare against the purely tabular mode for anything policy-shaped. Shares still sum to 100 % inside this toy numerator.',
      ],
    }
  }, [explorer, metric, vizMode])

  const sharePct = React.useMemo(() => resolved.bands.map((b) => b.shareFrac * 100), [resolved.bands])
  const maxSharePct = sharePct.reduce((m, x) => Math.max(m, x), 0)
  const compareYLim = React.useMemo(
    () => roundUpToStep(Math.max(maxSharePct * 1.12, maxSharePct + 3), 1),
    [maxSharePct],
  )

  const dense = resolved.bands.length > 12
  const showStackLegend = resolved.bands.length <= 12

  const stackData = React.useMemo(
    () => ({
      labels: [
        vizMode === 'destatisOfficialMass2021'
          ? 'Official assessed income‑tax mass = 100%'
          : vizMode === 'destatisMassWeightedPap2021'
            ? 'Mass‑weighted PAP tax units = 100%'
            : 'Sum of modeled tax = 100%',
      ],
      datasets: resolved.bands.map((b, idx) => ({
        label: b.legend,
        data: [b.shareFrac * 100],
        backgroundColor: fillSequential(idx, resolved.bands.length),
        borderColor: '#ffffff',
        borderWidth: dense ? 1 : 1.75,
        borderSkipped: false,
        stack: 'tax',
      })),
    }),
    [dense, resolved.bands, vizMode],
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
          display: showStackLegend,
          position: 'bottom' as const,
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            font: { size: dense ? 9 : 11 },
            padding: dense ? 4 : 8,
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
              const b = i !== undefined ? resolved.bands[i] : undefined
              return b?.stackTitle ?? ''
            },
            label: (ctx: { datasetIndex?: number }) => {
              const i = ctx.datasetIndex
              if (i === undefined || i < 0) return ''
              const b = resolved.bands[i]
              if (!b) return ''
              return [...b.stackLines]
            },
          },
        },
      },
      datasets: {
        bar: {
          barThickness: dense ? 48 : 54,
          maxBarThickness: dense ? 60 : 66,
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
          title: { display: true, text: resolved.stackXCaption },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { display: false },
          display: false,
        },
      },
    }),
    [dense, resolved.bands, resolved.stackXCaption, showStackLegend],
  )

  const compareData = React.useMemo(
    () => ({
      labels: resolved.bands.map((b) => b.tick),
      datasets: [
        {
          label: 'Share (% of summed modeled scope)',
          data: sharePct,
          backgroundColor: resolved.bands.map((_, idx) => fillSequential(idx, resolved.bands.length)),
          borderColor: '#ffffff',
          borderWidth: 1,
          borderRadius: dense ? 3 : 6,
          borderSkipped: false,
          barPercentage: dense ? 0.98 : 0.92,
          categoryPercentage: dense ? 0.98 : 0.88,
        },
      ],
    }),
    [dense, resolved.bands, resolved.compareYCaption, sharePct],
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
              const b = i !== undefined ? resolved.bands[i] : undefined
              return b?.compareTitle ?? ''
            },
            label: (ctx: { parsed?: { y?: number }; dataIndex?: number }) => {
              const i = ctx.dataIndex
              const y = ctx.parsed?.y
              const b = i !== undefined ? resolved.bands[i] : undefined
              if (!b || typeof y !== 'number') return ''
              return [...b.compareLines]
            },
          },
        },
      },
      datasets: { bar: {} },
      scales: {
        x: {
          grid: { display: false },
          ticks: dense
            ? {
                autoSkip: false,
                maxRotation: 55,
                minRotation: 40,
                font: { size: 9 },
              }
            : undefined,
          title: { display: true, text: dense ? 'Income band index (ticks shortened — see tooltip)' : 'Band' },
        },
        y: {
          beginAtZero: true,
          suggestedMax: compareYLim,
          grid: { color: '#eef2f6' },
          ticks: {
            callback: (v: string | number) => `${Number(v).toFixed(0)} %`,
            stepSize: compareYLim > 28 ? 5 : compareYLim > 16 ? 2 : 1,
          },
          title: { display: true, text: resolved.compareYCaption },
        },
      },
    }),
    [compareYLim, dense, resolved.bands, resolved.compareYCaption],
  )

  const chartKey = `${vizMode}-${metric}-${explorer.year}-${explorer.kvz}-${explorer.pkv}-${explorer.investmentIncome}`

  const metricLocked = vizMode === 'destatisOfficialMass2021'

  return (
    <details className="percentile-tax-panel" aria-labelledby="pct-tax-share-heading">
      <summary className="tax-dist-sim-expand-summary" id="pct-tax-share-heading">
        Tax concentration by income band
      </summary>
      <div className="tax-dist-sim-details-body">
        <div className="chart-percentile-caption chart-percentile-caption--muted">
          {resolved.blurbs.map((t, i) => (
            <p key={i} className="percentile-tax-blurb-line">
              {t}
            </p>
          ))}
          {dense && !showStackLegend ? (
            <p className="chart-percentile-caption__note percentile-tax-blurb-line">
              Legend hidden — hover stacked segments or use the tower chart ticks + tooltips.
            </p>
          ) : null}
        </div>
        <div className="tax-dist-sim-controls two-col">
          <label className="tax-dist-sim-label">
            Data mode
            <select value={vizMode} onChange={(e) => setVizMode(e.target.value as ContributionVizMode)}>
              {MODE_OPTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="tax-dist-sim-label">
            What to aggregate
            <select
              value={metric}
              disabled={metricLocked}
              onChange={(e) => setMetric(e.target.value as PercentileTaxContributionMetric)}
              title={
                metricLocked
                  ? 'Official table mode shows assessed income-tax mass only — employee SSC never appears in Destatis headline aggregates.'
                  : undefined
              }
            >
              {METRIC_OPTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {metricLocked ? (
          <p className="chart-percentile-caption chart-percentile-caption__note">
            Metric selector frozen: this view follows Destatis assessed income-tax liability aggregates only (employee
            SSC never appears in that headline table).
          </p>
        ) : null}
        <dl className="tax-dist-sim-stats results-dl">
          <dt>{resolved.totalLabel}</dt>
          <dd>{resolved.totalValue}</dd>
          <dt>Mass check (% sum of stacked segments)</dt>
          <dd>{resolved.massPctCheck.toFixed(2)}{' %'}</dd>
          {resolved.shareLo125Pct !== undefined && resolved.shareLo250Pct !== undefined ? (
            <>
              <dt>Heavy‑tail shorthand (tabular assessed IT&nbsp;Σ — bands with lo ≥ 125 k€ / 250 k€)</dt>
              <dd>
                {resolved.shareLo125Pct.toFixed(2)}
                {' % / '}
                {resolved.shareLo250Pct.toFixed(2)}
                {' %'}
              </dd>
            </>
          ) : null}
        </dl>
        <h3 className="tax-dist-sim-chart-subheading">Composition — adds to 100 %</h3>
        <div className={`percentile-tax-decile-stack-host${dense ? ' percentile-tax-decile-stack-host--dense' : ''}`}>
          <Bar key={`${chartKey}-stack`} data={stackData as any} options={stackOptions as any} />
        </div>
        <h3 className="tax-dist-sim-chart-subheading" id="pct-tax-decile-compare-heading">
          Comparison — bars share one axis
        </h3>
        <p className="chart-percentile-caption chart-percentile-caption--muted">
          Same shares as the strip; easier to read small differences between neighbours.
        </p>
        <div
          className={`percentile-tax-decile-compare-host${dense ? ' percentile-tax-decile-compare-host--dense' : ''}`}
          aria-labelledby="pct-tax-decile-compare-heading"
        >
          <Bar key={`${chartKey}-compare`} data={compareData as any} options={compareOptions as any} />
        </div>
      </div>
    </details>
  )
}
