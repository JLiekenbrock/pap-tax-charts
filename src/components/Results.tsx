import React from 'react'
import { PapCalculationResult } from '../lib/pap'
import { actualContributions } from '../lib/rates'
import { PapExplorerSettings } from './TaxInput'
import { realEuroFromNominalEuro } from '../lib/germany_vpi_annual'

export type PapChartYear = 2021 | 2025 | 2026

/** Rows in **Compare two years** tariff selectors (chronological order). */
export const PAP_COMPARE_YEARS: PapChartYear[] = [2021, 2025, 2026]

/** Stable “other column” tariff when avoiding duplicate A/B selections. */
export function siblingPapChartYear(primary: PapChartYear): PapChartYear {
  const other = PAP_COMPARE_YEARS.find((y) => y !== primary)
  return other ?? 2026
}

function eur(value: number) {
  return `EUR ${Math.round(value).toLocaleString()}`
}

/** Kindergeld per month — 2026 rate used in UI for both columns when comparing (amounts are close). */
const KINDERGELD_MONTHLY_2026 = 259

type ResultRowKey =
  | 'income_tax'
  | 'investment_tax'
  | 'solz'
  | 'church'
  | 'total_tax'
  | 'income_after_tax'
  | 'social'
  | 'take_home'
  | 'take_home_konstant'
  | 'kindergeld'
  | 'take_home_kindergeld'
  | 'eff_tax_salary'
  | 'eff_burden_salary'
  | 'eff_tax_total'
  | 'eff_burden_total'
  | 'income1'
  | 'income2'
  | 'investment_income'
  | 'saver_allowance'
  | 'investment_taxable'
  | 'zve'
  | 'ztabfb'
  | 'vsp'
  | 'vsp_renten'
  | 'vsp_kv'
  | 'vsp_alv'

const RESULT_ROWS_ORDER: ResultRowKey[] = [
  'income_tax',
  'investment_tax',
  'solz',
  'church',
  'total_tax',
  'income_after_tax',
  'social',
  'take_home',
  'take_home_konstant',
  'kindergeld',
  'take_home_kindergeld',
  'eff_tax_salary',
  'eff_burden_salary',
  'eff_tax_total',
  'eff_burden_total',
  'income1',
  'income2',
  'investment_income',
  'saver_allowance',
  'investment_taxable',
  'zve',
  'ztabfb',
  'vsp',
  'vsp_renten',
  'vsp_kv',
  'vsp_alv',
]

export type ResultRow = {
  key: ResultRowKey
  label: string
  /** Optional longer explanation rendered under the label (Konstant metrics, disclaimers). */
  detail?: string
  display: string
  /** Raw EUR for Δ column when both sides are EUR amounts. */
  deltaEur: number | null
  /** Raw rate (0–100 scale) for Δ in percentage points. */
  deltaRatePct: number | null
}

function buildResultRows(
  result: PapCalculationResult,
  settings: PapExplorerSettings,
  vspInRates: boolean,
): ResultRow[] {
  const socialContributions = actualContributions(result)
  const incomeAfterTax = Math.max(0, result.totalIncome - result.tax)
  const takeHomeCash = Math.max(0, result.totalIncome - result.tax - socialContributions)
  const kindergeld = settings.includeKindergeld ? settings.kindergeldChildren * KINDERGELD_MONTHLY_2026 * 12 : 0

  const salaryTaxRate = result.income > 0 ? (result.payrollTax / result.income) * 100 : 0
  const totalTaxRate = result.totalIncome > 0 ? (result.tax / result.totalIncome) * 100 : 0
  const salaryBurdenRate = result.income > 0 ? ((result.payrollTax + socialContributions) / result.income) * 100 : 0
  const totalBurdenRate =
    result.totalIncome > 0 ? ((result.tax + socialContributions) / result.totalIncome) * 100 : 0

  const byKey = new Map<ResultRowKey, ResultRow>()

  const setEur = (key: ResultRowKey, label: string, amount: number, detail?: string) => {
    byKey.set(key, {
      key,
      label,
      ...(detail !== undefined ? { detail } : {}),
      display: eur(amount),
      deltaEur: amount,
      deltaRatePct: null,
    })
  }
  const setPct = (key: ResultRowKey, label: string, pct: number) => {
    byKey.set(key, { key, label, display: `${pct.toFixed(2)}%`, deltaEur: null, deltaRatePct: pct })
  }

  setEur('income_tax', 'Income tax', result.base)
  if (result.investmentTax > 0) setEur('investment_tax', 'Investment tax', result.investmentTax)
  if (result.solz > 0) setEur('solz', 'Solidarity surcharge', result.solz)
  if (result.church > 0) setEur('church', 'Church tax', result.church)
  setEur('total_tax', 'Total tax', result.tax)
  setEur('income_after_tax', 'Income after tax', incomeAfterTax)
  setEur('social', 'Social contributions', socialContributions)
  setEur('take_home', 'Take-home cash', takeHomeCash)
  {
    const B = settings.realIncomeBaseYear ?? 2021
    const yTariff = result.year
    const takeKonst = Math.max(0, realEuroFromNominalEuro(takeHomeCash, yTariff, B))
    const detailParts = [
      `Formula: Take‑home (Konstant ${B}) = round( Take‑home cash × VPI_JD(${B}) ÷ VPI_JD(${yTariff}) ) in €.`,
      `VPI_JD(y) is the Destatis Deutschland annual index (Jahresmittel), basis 2020 = 100.`,
    ]
    const detail = detailParts.join(' ')
    setEur('take_home_konstant', `Take‑home (Konstant ${B})`, takeKonst, detail)
  }

  if (settings.includeKindergeld) {
    setEur('kindergeld', 'Kindergeld', kindergeld)
    setEur('take_home_kindergeld', 'Take-home incl. Kindergeld', takeHomeCash + kindergeld)
  }
  setPct('eff_tax_salary', 'Effective tax on salary', salaryTaxRate)
  if (vspInRates) {
    setPct('eff_burden_salary', 'Effective burden (tax + VSP) on salary', salaryBurdenRate)
  }
  if (result.investmentIncome > 0) {
    setPct('eff_tax_total', 'Effective tax on total income', totalTaxRate)
    if (vspInRates) {
      setPct('eff_burden_total', 'Effective burden (tax + VSP) on total income', totalBurdenRate)
    }
  }
  if (settings.filing === 'married') {
    const m = result.marriedEarners
    if (m) {
      setEur('income1', 'Income 1', m[0].income)
      setEur('income2', 'Income 2', m[1].income)
    } else {
      setEur('income1', 'Income 1', settings.income1)
      setEur('income2', 'Income 2', settings.income2)
    }
  }
  if (result.investmentIncome > 0) {
    setEur('investment_income', 'Investment income', result.investmentIncome)
    setEur('saver_allowance', 'Saver allowance', result.saverAllowance)
    setEur('investment_taxable', 'Investment taxable', result.investmentTaxable)
  }
  setEur('zve', 'Taxable income / ZVE', result.zve)
  setEur('ztabfb', 'ZTABFB', result.ztabfb)
  setEur('vsp', 'VSP (deductible)', result.vsp)
  setEur('vsp_renten', 'Pension part', result.vspRenten)
  setEur('vsp_kv', 'Health/care part', result.vspKrankenPflege)
  setEur('vsp_alv', 'Unemployment part', result.vspArbeitslosen)

  return RESULT_ROWS_ORDER.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!)
}

function formatDeltaEur(a: number, b: number): string {
  const d = Math.round(b) - Math.round(a)
  if (d === 0) return '—'
  if (d > 0) return `+${eur(d)}`
  return `−${eur(-d)}`
}

function formatDeltaRate(a: number | null, b: number | null): string {
  if (a === null || b === null) return '—'
  const d = b - a
  if (Math.abs(d) < 0.005) return '—'
  const sign = d > 0 ? '+' : ''
  return `${sign}${d.toFixed(2)} pp`
}

export default function Results({
  result,
  settings,
  vspInRates,
  yearCompareEnabled,
  onYearCompareEnabledChange,
  compareYearA,
  compareYearB,
  onCompareYearAChange,
  onCompareYearBChange,
  onSwapCompareYears,
  resultCompareA,
  resultCompareB,
}: {
  result: PapCalculationResult
  settings: PapExplorerSettings
  vspInRates: boolean
  yearCompareEnabled: boolean
  onYearCompareEnabledChange: (next: boolean) => void
  compareYearA: PapChartYear
  compareYearB: PapChartYear
  onCompareYearAChange: (next: PapChartYear) => void
  onCompareYearBChange: (next: PapChartYear) => void
  onSwapCompareYears: () => void
  resultCompareA: PapCalculationResult | null
  resultCompareB: PapCalculationResult | null
}) {
  const rowsSingle = React.useMemo(
    () => buildResultRows(result, settings, vspInRates),
    [result, settings, vspInRates],
  )

  const rowsA = React.useMemo(() => {
    if (!resultCompareA) return null
    return buildResultRows(resultCompareA, settings, vspInRates)
  }, [resultCompareA, settings, vspInRates])

  const rowsB = React.useMemo(() => {
    if (!resultCompareB) return null
    return buildResultRows(resultCompareB, settings, vspInRates)
  }, [resultCompareB, settings, vspInRates])

  const compareKeys = React.useMemo(() => {
    if (!rowsA || !rowsB) return []
    const keysA = new Set(rowsA.map((r) => r.key))
    const keysB = new Set(rowsB.map((r) => r.key))
    return RESULT_ROWS_ORDER.filter((k) => keysA.has(k) || keysB.has(k))
  }, [rowsA, rowsB])

  const rowBByKey = React.useMemo(() => {
    const m = new Map<ResultRowKey, ResultRow>()
    rowsB?.forEach((r) => m.set(r.key, r))
    return m
  }, [rowsB])

  const rowAByKey = React.useMemo(() => {
    const m = new Map<ResultRowKey, ResultRow>()
    rowsA?.forEach((r) => m.set(r.key, r))
    return m
  }, [rowsA])

  return (
    <details className="tax-breakdown-panel" open aria-labelledby="tax-breakdown-heading">
      <summary className="tax-dist-sim-expand-summary" id="tax-breakdown-heading">
        Tax breakdown{' '}
        <span className="tax-breakdown-summary-preview">
          ({eur(result.income)} gross · {eur(result.tax)} tax)
        </span>
      </summary>
      <div className="tax-dist-sim-details-body">
        <div className="result-kpi">
          <div className="result-kpi-income">
            <span>{eur(result.income)}</span>
            <small>Gross salary (RE4)</small>
          </div>
          <div className="result-kpi-tax">
            <strong>{eur(result.tax)}</strong>
            <small>Total tax ({settings.year})</small>
          </div>
        </div>

        <div className="year-compare-block results-year-compare">
          <label className="checkbox-row metric-option">
            <input
              type="checkbox"
              checked={yearCompareEnabled}
              onChange={(e) => onYearCompareEnabledChange(e.target.checked)}
            />
            Compare two PAP years in the table below
          </label>
          {yearCompareEnabled && (
            <div className="year-compare-pair">
              <div className="year-compare-selects">
                <label className="year-compare-field">
                  <span>Column A</span>
                  <select value={compareYearA} onChange={(e) => onCompareYearAChange(Number(e.target.value) as PapChartYear)}>
                    {PAP_COMPARE_YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="year-compare-swap" onClick={onSwapCompareYears} title="Swap columns">
                  ⇄
                </button>
                <label className="year-compare-field">
                  <span>Column B</span>
                  <select value={compareYearB} onChange={(e) => onCompareYearBChange(Number(e.target.value) as PapChartYear)}>
                    {PAP_COMPARE_YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="year-compare-hint">
                Both columns use the same <strong>nominal salary (RE4)</strong> implied by your inputs for the explorer tax year (
                {settings.year}); only each column’s <strong>PAP tariff</strong> differs. Statutory nominal ZVE can still differ
                slightly between years (allowances, ceilings, VSP). KPI above stays {settings.year} only.
              </p>
            </div>
          )}
        </div>

        {yearCompareEnabled && rowsA && rowsB && compareYearA !== compareYearB ? (
          <div className="results-table-wrap">
            <table className="results-compare-table">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">{compareYearA}</th>
                  <th scope="col">{compareYearB}</th>
                  <th scope="col">Δ (B − A)</th>
                </tr>
              </thead>
              <tbody>
                {compareKeys.map((key) => {
                  const a = rowAByKey.get(key)
                  const b = rowBByKey.get(key)
                  const label = a?.label ?? b?.label ?? key
                  const detail = a?.detail ?? b?.detail
                  let delta = '—'
                  if (a && b && a.deltaEur !== null && b.deltaEur !== null) {
                    delta = formatDeltaEur(a.deltaEur, b.deltaEur)
                  } else if (a && b && a.deltaRatePct !== null && b.deltaRatePct !== null) {
                    delta = formatDeltaRate(a.deltaRatePct, b.deltaRatePct)
                  }
                  return (
                    <tr key={key}>
                      <th scope="row">
                        {detail ? (
                          <div className="results-dt-stack">
                            <span>{label}</span>
                            <small className="results-row-detail">{detail}</small>
                          </div>
                        ) : (
                          label
                        )}
                      </th>
                      <td>{a?.display ?? '—'}</td>
                      <td>{b?.display ?? '—'}</td>
                      <td className="results-compare-delta">{delta}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <dl className="results-dl">
            {rowsSingle.map((row) => (
              <React.Fragment key={row.key}>
                <dt>
                  {row.detail ? (
                    <div className="results-dt-stack">
                      <span>{row.label}</span>
                      <small className="results-row-detail">{row.detail}</small>
                    </div>
                  ) : (
                    row.label
                  )}
                </dt>
                <dd>{row.display}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </div>
    </details>
  )
}
