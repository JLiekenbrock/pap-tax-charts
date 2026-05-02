import React from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js'
import type { PapExplorerSettings } from './TaxInput'
import type { TaxBurdenSimDraw } from '../lib/tax_distribution_sim'
import {
  DEMOGRAPHIC_SIM_PRESETS_DEFAULT,
  type TaxBurdenPrimaryBruttoSampling,
  type TaxBurdenSimConfig,
  defaultTaxSimBasePap,
  simulateTaxBurdenDistribution,
} from '../lib/tax_distribution_sim'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

/** Horizontal resolution: equal-count income slices averaged per scenario line. */
const SCENARIO_INCOME_CURVE_SEGMENTS = 32

/** Same Euros as Pap `totalIncome` when investment only augments Arbeitseinkommen. */
function modeledTotalIncomeEur(draw: TaxBurdenSimDraw, investmentIncome: number): number {
  const inv = Math.max(0, investmentIncome)
  return draw.totalGrossAnnual + inv
}

function formatEurRounded(n: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

const EUR_TICK_FMT = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function incomeXTicks(value: number | string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return EUR_TICK_FMT.format(n)
}

type IncomeBurdenCurvePoint = { x: number; y: number }

function medianNums(values: readonly number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = (sorted.length - 1) / 2
  const lo = Math.floor(mid)
  const hi = Math.ceil(mid)
  if (lo === hi) return sorted[lo]!
  return 0.5 * (sorted[lo]! + sorted[hi]!)
}

/**
 * Equal-count buckets on modeled total €; **`x`** = mean € inside slice, **`y`** = **median** burden %.
 * Drops modeled incomes below **`minIncomeEur`** so fixed yearly PKV does not inflate % arbitrarily on tiny denominators.
 */
function incomeBurdenQuantileCurve(
  draws: ReadonlyArray<TaxBurdenSimDraw>,
  investmentIncome: number,
  buckets: number,
  minIncomeEur: number,
): IncomeBurdenCurvePoint[] {
  const inv = Math.max(0, investmentIncome)
  if (!draws.length || buckets <= 0) return []
  const filtered = [...draws]
    .map((d) => ({ inc: modeledTotalIncomeEur(d, inv), bd: d.totalBurdenPct }))
    .filter((p) => p.inc >= minIncomeEur && Number.isFinite(p.bd))
    .sort((a, b) => (a.inc === b.inc ? a.bd - b.bd : a.inc - b.inc))

  const n = filtered.length
  if (!n) return []
  const segments = Math.min(Math.max(1, buckets), n)
  const out: IncomeBurdenCurvePoint[] = []
  for (let q = 0; q < segments; q++) {
    const lo = Math.floor((q * n) / segments)
    const hi = Math.floor(((q + 1) * n) / segments)
    if (lo >= hi) continue
    let sx = 0
    let c = 0
    const burdens: number[] = []
    for (let k = lo; k < hi; k++) {
      const p = filtered[k]!
      sx += p.inc
      burdens.push(p.bd)
      c++
    }
    out.push({ x: sx / c, y: medianNums(burdens) })
  }
  return out
}

export type HouseholdSamplingUi = 'wage_decile' | 'destatis_typ1'

function basePapFromExplorer(explorer: PapExplorerSettings): TaxBurdenSimConfig['basePap'] {
  const y = explorer.year === 2025 ? 2025 : 2026
  return {
    ...defaultTaxSimBasePap(y),
    solidarity: explorer.solidarity,
    churchRate: explorer.churchRate,
    kvz: explorer.kvz,
    pvs: explorer.pvs,
    pvz: explorer.pvz,
    pva: explorer.pva,
    krv: explorer.krv,
    alv: explorer.alv,
    pkv: explorer.pkv,
    pkpv: explorer.pkpv,
    pkpvagz: explorer.pkpvagz,
    investmentIncome: Math.max(0, explorer.investmentIncome),
  }
}

function buildSimCfg(
  explorer: PapExplorerSettings,
  opts: {
    sampleSize: number
    rngSeed: number
    household: HouseholdSamplingUi
    mzStrat: boolean
    equivBridge: boolean
  },
): TaxBurdenSimConfig {
  const y = explorer.year === 2025 ? 2025 : 2026
  const hs =
    opts.household === 'destatis_typ1' ? ('destatis_net_equiv_typ1_persons_2025' as const) : undefined

  let primaryBruttoSampling: TaxBurdenPrimaryBruttoSampling | undefined
  if (opts.household === 'destatis_typ1') {
    primaryBruttoSampling = opts.equivBridge ? 'equiv_net_typ1_quartiles_to_gesamt_rank' : undefined
  }

  const mzLayer =
    opts.household === 'destatis_typ1' && opts.mzStrat
      ? { mz2025FamilienTabelle2_1ChildStrat: true as const }
      : {}

  return {
    ...DEMOGRAPHIC_SIM_PRESETS_DEFAULT,
    sampleSize: Math.max(200, Math.min(50_000, Math.floor(opts.sampleSize))),
    rngSeed: opts.rngSeed,
    year: y,
    householdSampling: hs,
    primaryBruttoSampling,
    ...mzLayer,
    maxChildrenSim: DEMOGRAPHIC_SIM_PRESETS_DEFAULT.maxChildrenSim,
    basePap: basePapFromExplorer(explorer),
  }
}

function buildSyntheticHouseholdIncomeCurveCfg(
  explorer: PapExplorerSettings,
  sampleSize: number,
  rngSeed: number,
  sketch: NonNullable<TaxBurdenSimConfig['fixedHouseholdSketch']>,
  insurance: 'gkv' | 'pkv_demo',
): TaxBurdenSimConfig {
  const y = explorer.year === 2025 ? 2025 : 2026
  const base = basePapFromExplorer(explorer)
  const basePapMerged: TaxBurdenSimConfig['basePap'] =
    insurance === 'gkv'
      ? { ...base, pkv: 0, pkpv: 0, pkpvagz: 0 }
      : {
          ...base,
          pkv: 1,
          pkpv: Math.max(base.pkpv ?? 0, 60_000),
          pkpvagz: Math.max(base.pkpvagz ?? 0, 30_000),
        }

  return {
    ...DEMOGRAPHIC_SIM_PRESETS_DEFAULT,
    sampleSize: Math.max(200, Math.min(50_000, Math.floor(sampleSize))),
    rngSeed,
    year: y,
    householdSampling: undefined,
    primaryBruttoSampling: undefined,
    fixedHouseholdSketch: sketch,
    maxChildrenSim: DEMOGRAPHIC_SIM_PRESETS_DEFAULT.maxChildrenSim,
    basePap: basePapMerged,
  }
}

/** Burden-vs-income overlays: canonical life + insurance setups on the brute spline wage path. */
const HOUSEHOLD_INSURANCE_SCENARIO_LINES = [
  {
    label: 'Ledig · keine Kinder · GKV',
    color: '#0f766e',
    rngSlot: 1,
    sketch: { filing: 'single' as const, children: 0 },
    insurance: 'gkv' as const,
    curveIncomeFloorEur: 22_000,
  },
  {
    label: 'Verheiratet · keine Kinder · GKV (~Zwei‑Erwerbstätigkeit anteilig)',
    color: '#2563eb',
    rngSlot: 2,
    sketch: { filing: 'married' as const, children: 0 },
    insurance: 'gkv' as const,
    curveIncomeFloorEur: 22_000,
  },
  {
    label: 'Verheiratet · 1 Kind · GKV',
    color: '#ea580c',
    rngSlot: 7,
    sketch: { filing: 'married' as const, children: 1 },
    insurance: 'gkv' as const,
    curveIncomeFloorEur: 22_000,
  },
  {
    label: 'Verheiratet · 2 Kinder · GKV',
    color: '#b45309',
    rngSlot: 3,
    sketch: { filing: 'married' as const, children: 2 },
    insurance: 'gkv' as const,
    curveIncomeFloorEur: 22_000,
  },
  {
    label: 'Alleinerziehend · 1 Kind · GKV',
    color: '#0891b2',
    rngSlot: 4,
    sketch: { filing: 'single' as const, children: 1 },
    insurance: 'gkv' as const,
    curveIncomeFloorEur: 22_000,
  },
  {
    label: 'Alleinerziehend · 1 Kind · PKV (illus. 600 / 300 € AG‑Zuschuss / Mon)',
    color: '#6b21a8',
    rngSlot: 9,
    sketch: { filing: 'single' as const, children: 1 },
    insurance: 'pkv_demo' as const,
    curveIncomeFloorEur: 38_000,
  },
  {
    label: 'Ledig · keine Kinder · PKV (illus. 600 / 300 € AG‑Zuschuss / Mon)',
    color: '#6d28d9',
    rngSlot: 5,
    sketch: { filing: 'single' as const, children: 0 },
    insurance: 'pkv_demo' as const,
    curveIncomeFloorEur: 38_000,
  },
  {
    label: 'Verheiratet · 1 Kind · PKV (illus. 600 / 300 € AG‑Zuschuss / Mon)',
    color: '#9d174d',
    rngSlot: 8,
    sketch: { filing: 'married' as const, children: 1 },
    insurance: 'pkv_demo' as const,
    curveIncomeFloorEur: 38_000,
  },
  {
    label: 'Verheiratet · 2 Kinder · PKV (illus. 600 / 300 € AG‑Zuschuss / Mon)',
    color: '#be185d',
    rngSlot: 6,
    sketch: { filing: 'married' as const, children: 2 },
    insurance: 'pkv_demo' as const,
    curveIncomeFloorEur: 38_000,
  },
] satisfies ReadonlyArray<{
  label: string
  color: string
  rngSlot: number
  sketch: NonNullable<TaxBurdenSimConfig['fixedHouseholdSketch']>
  insurance: 'gkv' | 'pkv_demo'
  curveIncomeFloorEur: number
}>
function trimHistogramBinsToMass(
  bins: ReadonlyArray<{ lo: number; hi: number; count: number; share: number }>,
) {
  let first = -1
  for (let i = 0; i < bins.length; i++) {
    if (bins[i]!.count > 0) {
      first = i
      break
    }
  }
  if (first === -1) return [...bins]
  let last = first
  for (let i = bins.length - 1; i >= first; i--) {
    if (bins[i]!.count > 0) {
      last = i
      break
    }
  }
  return bins.slice(first, last + 1)
}

export default function TaxDistributionSimChart({ explorer }: { explorer: PapExplorerSettings }) {
  const [household, setHousehold] = React.useState<HouseholdSamplingUi>('destatis_typ1')
  const [equivBridge, setEquivBridge] = React.useState(false)
  const [mzStrat, setMzStrat] = React.useState(true)
  const [sampleSize, setSampleSize] = React.useState(4200)
  const [rngSeed, setRngSeed] = React.useState(20261902)

  const cfg = React.useMemo(
    () =>
      buildSimCfg(explorer, {
        sampleSize,
        rngSeed,
        household,
        mzStrat,
        equivBridge,
      }),
    [explorer, sampleSize, rngSeed, household, mzStrat, equivBridge],
  )

  const result = React.useMemo(() => simulateTaxBurdenDistribution(cfg), [cfg])

  const chartBins = React.useMemo(
    () => trimHistogramBinsToMass(result.histogram.bins),
    [result.histogram.bins],
  )

  const labels = chartBins.map(({ lo, hi }, i, arr) =>
    i === arr.length - 1 ? `[${lo}-${hi}]` : `[${lo}-${hi})`,
  )
  const sharePctData = chartBins.map((b) => b.share * 100)

  const data = React.useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: 'Simulated share (% of draws)',
          data: sharePctData,
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15,118,110,0.65)',
          borderWidth: 0,
          borderSkipped: false,
          barPercentage: 1,
          categoryPercentage: 0.94,
        },
      ],
    }),
    [labels, sharePctData],
  )

  const scenarioIncomeLineChartData = React.useMemo(() => {
    const inv = Math.max(0, explorer.investmentIncome)
    return {
      datasets: HOUSEHOLD_INSURANCE_SCENARIO_LINES.map((spec) => {
        const cfgLine = buildSyntheticHouseholdIncomeCurveCfg(
          explorer,
          sampleSize,
          rngSeed + spec.rngSlot * 131_071,
          spec.sketch,
          spec.insurance,
        )
        const sim = simulateTaxBurdenDistribution(cfgLine)
        const pts = incomeBurdenQuantileCurve(
          sim.draws,
          inv,
          SCENARIO_INCOME_CURVE_SEGMENTS,
          spec.curveIncomeFloorEur,
        )
        return {
          label: spec.label,
          data: pts as any,
          parsing: false as const,
          showLine: true,
          tension: 0.15,
          borderColor: spec.color,
          borderWidth: 2,
          backgroundColor: 'transparent',
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: spec.color,
        }
      }),
    }
  }, [explorer, sampleSize, rngSeed])

  const s = result.summary
  const options = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' as const },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed: { y?: number }; dataset: { label?: string } }) => {
              const si = typeof ctx.parsed?.y === 'number' ? ctx.parsed.y : NaN
              const binIdx = typeof ctx.dataIndex === 'number' ? ctx.dataIndex : -1
              const bin = binIdx >= 0 ? chartBins[binIdx] : null
              const count = bin ? bin.count : 0
              return `${ctx.dataset.label ?? ''}: ${si.toFixed(2)}% (n=${count})`.trim()
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: '(Tax + employer social share) ÷ modeled total income × 100' },
          grid: { display: false },
          ticks: { maxRotation: 55, minRotation: 0, font: { size: 10 } },
        },
        y: {
          min: 0,
          title: { display: true, text: 'Share of simulations (%)' },
          ticks: { callback: (v: number | string) => `${Number(v).toFixed(1)}%` },
        },
      },
    }),
    [chartBins],
  )

  const scenarioIncomeLineOptions = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest' as const, intersect: false },
      plugins: {
        legend: { position: 'bottom' as const },
        tooltip: {
          callbacks: {
            title(items: readonly { dataset: { label?: string } }[]) {
              return items[0]?.dataset.label ?? ''
            },
            label(ctx: any) {
              const raw = ctx.raw as IncomeBurdenCurvePoint
              if (!(raw && typeof raw.x === 'number' && typeof raw.y === 'number')) return ''
              return `Mean modeled income ≈ ${formatEurRounded(raw.x)} → median slice burden ${raw.y.toFixed(2)}%`
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear' as const,
          title: { display: true, text: 'Modeled household total income (EUR / yr)' },
          suggestedMin: 18_000,
          grid: { color: '#eef2f6' },
          ticks: {
            callback: incomeXTicks,
            maxTicksLimit: 9,
          },
        },
        y: {
          min: 0,
          title: {
            display: true,
            text: 'Tax + employee SSC burden (% of modeled total income)',
          },
          grid: { color: '#eef2f6' },
          ticks: {
            callback: (v: number | string) => `${Math.round(Number(v))} %`,
          },
        },
      },
    }),
    [],
  )

  const key = `${household}-${equivBridge}-${mzStrat}-${sampleSize}-${rngSeed}-${explorer.year}`

  const hsCaption =
    household === 'destatis_typ1'
      ? `SILC einkommen-typ-1 (2025 person weights).${equivBridge ? ' Primary wage rank bridged via equivalised-net quartiles to overall surrogate rank.' : ''} ${mzStrat ? ' Children count / paired-parent Ehe versus Lebensgemeinschaft overlay from Mikrozensus table 2-1.' : ' Children count uses geometric heuristic (defaults).'}`
      : `Wage-decile demographic preset (pMarried ${DEMOGRAPHIC_SIM_PRESETS_DEFAULT.pMarried.toFixed(2)}, optional per-decile overrides).`

  return (
    <details className="tax-dist-sim-panel" aria-labelledby="tax-dist-sim-heading">
      <summary className="tax-dist-sim-expand-summary" id="tax-dist-sim-heading">
        Synthetic burden distribution
      </summary>
      <div className="tax-dist-sim-details-body">
        <p className="chart-percentile-caption chart-percentile-caption--muted">
          Monte Carlo draws from <code>tax_distribution_sim.ts</code> (FT wage spline ± household priors).
          Vertical axis counts only <strong>(income tax + modeled employee payroll tax + VSP + Pflege + …) / total income × 100</strong> — aligned with explorer insurance toggles shown above — not Staatsrechnungs‑Soli/Kirchen split rules.
        </p>
        <div className="tax-dist-sim-controls two-col">
        <label className="tax-dist-sim-label">
          Sampling
          <select value={household} onChange={(e) => setHousehold(e.target.value as HouseholdSamplingUi)}>
            <option value="destatis_typ1">Destatis SILC Haushaltstyp + Familien strata (recommended)</option>
            <option value="wage_decile">Legacy wage‑decile demographics preset</option>
          </select>
        </label>
        <label className="checkbox-row tax-dist-sim-check">
          <input
            type="checkbox"
            checked={mzStrat}
            onChange={(e) => setMzStrat(e.target.checked)}
            disabled={household !== 'destatis_typ1'}
          />
          <span>Mikrozensus Tab. 2–1 Kinder / Lebensform (paired parents)</span>
        </label>
        <label className="checkbox-row tax-dist-sim-check">
          <input
            type="checkbox"
            checked={equivBridge}
            onChange={(e) => setEquivBridge(e.target.checked)}
            disabled={household !== 'destatis_typ1'}
          />
          <span>Äquivalent‑net quartiles → brute spline rank bridge</span>
        </label>
        <label>
          Monte Carlo draws (200–50 000)
          <input
            type="number"
            min={200}
            max={50_000}
            step={100}
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value) || sampleSize)}
          />
        </label>
        <label>
          RNG seed (deterministic)
          <input
            type="number"
            value={rngSeed}
            onChange={(e) => setRngSeed(Number(e.target.value) || 1)}
          />
        </label>
        </div>
        <dl className="tax-dist-sim-stats results-dl">
        <dt>Scenario</dt>
        <dd>{hsCaption}</dd>
        <dt>n</dt>
        <dd>{s.n}</dd>
        <dt>Mean burden %</dt>
        <dd>{s.meanBurdenPct.toFixed(2)}</dd>
        <dt>Std dev</dt>
        <dd>{s.stdevBurdenPct.toFixed(2)}</dd>
        <dt>p10 / p25 / p50 / p75 / p90</dt>
        <dd>
          {s.p10.toFixed(1)} / {s.p25.toFixed(1)} / {s.p50.toFixed(1)} / {s.p75.toFixed(1)} / {s.p90.toFixed(1)}
        </dd>
        </dl>
        <div className="tax-dist-sim-canvas-host">
          <Bar key={key} data={data as any} options={options as any} />
        </div>

        <h3 className="tax-dist-sim-chart-subheading" id="tax-dist-sim-income-heading">
          Canonical life‑situation curves (GKV / PKV)
        </h3>
        <p className="chart-percentile-caption chart-percentile-caption--muted">
        Each line is an independent Monte Carlo on the FT‑brutto percentile spline plus default decile sociology priors
        (same global <code>pMarried</code> / Zweiverdiener anteilig as the wage‑decile path), while{' '}
        <strong>Kinderzahl / Veranlagungsform</strong> and <strong>GKV vs illustrative PKV</strong> are held fixed via{' '}
        <code>fixedHouseholdSketch</code> and forced <code>pkv</code> tiers (PKV uses explorer premiums if higher than the
        €600 / Mo + €300 AG‑Zuschuss defaults). PKV overlays drop draws whose modeled yearly total&nbsp;€ stays below&nbsp;
        <strong>38 k€</strong> so fixed annual premiums do not inflate % arbitrarily; GKV overlays use&nbsp;
        <strong>22 k€</strong>.
        Bands pool the remainder into&nbsp;
        <strong>{SCENARIO_INCOME_CURVE_SEGMENTS}</strong>{' '}
        equal‑count slices; plotted <strong>x</strong>&nbsp;= mean € in slice,&nbsp;<strong>y</strong>&nbsp;={' '}
        <strong>median</strong>
        burden % (robuster than averaging when denominators bounce). Histogram above unrelated — benchmarking only.
        </p>
        <div className="tax-dist-sim-canvas-host" aria-labelledby="tax-dist-sim-income-heading">
          <Line
            key={`${key}-scenario-lines`}
            data={scenarioIncomeLineChartData as any}
            options={scenarioIncomeLineOptions as any}
          />
        </div>
      </div>
    </details>
  )
}
