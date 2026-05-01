import type { Chart as ChartJS, Plugin } from 'chart.js'

export type IncomePercentileMarker = { readonly p: number; readonly eur: number }

export type IncomePercentileRugOptions = {
  enabled: boolean
  /** Lower x bound for rug EUR (linear: often 0; log: must be &gt; 0). */
  clipXMinEur: number
  /** Upper x bound for rug EUR. */
  clipXMaxEur: number
  markers: ReadonlyArray<IncomePercentileMarker>
  /**
   * When x is a category axis, pass RE4 values in label order (same as chart data labels).
   * Each rug snaps to the category whose income is closest to the percentile EUR.
   */
  categoryIncomes: readonly number[] | null
  /**
   * When the chart’s x-axis is already in “percentile space” (not raw EUR),
   * map each marker’s EUR to that x-coordinate before resolving pixels (linear x).
   */
  xFromIncomeEur?: (eur: number) => number
}

const RUG = 'rgba(71, 85, 105, 0.55)'
const LABEL = 'rgba(51, 65, 85, 0.88)'

function closestCategoryIndex(targetEur: number, incomes: readonly number[]): number {
  if (incomes.length === 0) return 0
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < incomes.length; i++) {
    const d = Math.abs(incomes[i]! - targetEur)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function xPixelForIncome(
  chart: ChartJS,
  eur: number,
  lo: number,
  hi: number,
  categoryIncomes: readonly number[] | null,
  xFromIncomeEur?: (eur: number) => number,
): number | null {
  const xScale = chart.scales.x
  if (!xScale) return null

  if (xScale.type === 'linear' || xScale.type === 'logarithmic') {
    const xVal = typeof xFromIncomeEur === 'function' ? xFromIncomeEur(eur) : eur
    if (!Number.isFinite(xVal)) return null
    if (typeof xFromIncomeEur !== 'function' && (eur < lo || eur > hi)) return null
    if (typeof xFromIncomeEur === 'function') {
      const loX = xFromIncomeEur(lo)
      const hiX = xFromIncomeEur(hi)
      if (!(Number.isFinite(loX) && Number.isFinite(hiX))) return null
      const dMin = Math.min(loX, hiX)
      const dMax = Math.max(loX, hiX)
      if (xVal < dMin || xVal > dMax) return null
    }
    return xScale.getPixelForValue(xVal)
  }

  if (xScale.type === 'category' && categoryIncomes && categoryIncomes.length > 0) {
    const idx = closestCategoryIndex(eur, categoryIncomes)
    const label = categoryIncomes[idx]
    if (label == null || !Number.isFinite(label)) return null
    return xScale.getPixelForValue(label)
  }

  return null
}

/** Small “rug” ticks at Destatis percentile incomes (works on linear or category x). */
export function createIncomePercentileRugsPlugin(opts: IncomePercentileRugOptions): Plugin {
  return {
    id: 'incomePercentileRugs',
    afterDatasetsDraw(chart: ChartJS) {
      if (!opts.enabled) return
      const xScale = chart.scales.x
      const { ctx, chartArea } = chart
      if (!xScale || chartArea == null) return

      const lo = Math.max(0, Math.min(opts.clipXMinEur, opts.clipXMaxEur))
      const hi = Math.max(lo, opts.clipXMaxEur)

      const rugUp = 11
      const xs: number[] = []
      for (const m of opts.markers) {
        const x = xPixelForIncome(chart, m.eur, lo, hi, opts.categoryIncomes, opts.xFromIncomeEur)
        if (x == null || !Number.isFinite(x)) continue
        if (x < chartArea.left - 1 || x > chartArea.right + 1) continue
        xs.push(x)
      }
      if (xs.length === 0) return

      ctx.save()
      ctx.strokeStyle = RUG
      ctx.lineWidth = 1.25
      ctx.lineCap = 'butt'
      for (const x of xs) {
        ctx.beginPath()
        ctx.moveTo(x, chartArea.bottom)
        ctx.lineTo(x, chartArea.bottom - rugUp)
        ctx.stroke()
      }

      ctx.font = '9px Inter, system-ui, sans-serif'
      ctx.fillStyle = LABEL
      ctx.textBaseline = 'bottom'
      const labelPts = opts.markers.filter((m) => [10, 50, 90, 95, 99].includes(m.p))
      let lastX = -1e9
      for (const m of labelPts) {
        const x = xPixelForIncome(chart, m.eur, lo, hi, opts.categoryIncomes, opts.xFromIncomeEur)
        if (x == null || x < chartArea.left + 2 || x > chartArea.right - 2) continue
        if (x - lastX < 22) continue
        lastX = x
        const text = `p${m.p}`
        const tw = ctx.measureText(text).width
        ctx.fillText(text, x - tw / 2, chartArea.bottom - rugUp - 2)
      }
      ctx.restore()
    },
  }
}

/** @deprecated Use {@link createIncomePercentileRugsPlugin}. */
export const createIncomePercentileBandsPlugin = createIncomePercentileRugsPlugin
