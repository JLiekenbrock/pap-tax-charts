import React from 'react'
import { PapCalculationResult } from '../lib/pap'
import {
  PRIVILEGE_INCOME_SOURCE_LABEL,
  MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR,
  DESTATIS_INCOME_TABLE_PUBLICATION_YEAR,
  type PrivilegeComparisonMode,
  type TaxOutcomeBand,
  computePrivilegeSnapshot,
} from '../lib/privilege_benchmark'
import type { PapExplorerSettings } from './TaxInput'

function pct(value: number) {
  return `${value.toFixed(1)}%`
}

const verdictCopyIntra: Record<
  TaxOutcomeBand,
  { title: string; blurb: string; className: string }
> = {
  winner: {
    title: 'Tax winner',
    className: 'privilege-verdict privilege-verdict--winner',
    blurb:
      'Your modeled payroll income tax (incl. Soli/church) as a share of salary is lower than the tariff-adjusted Destatis aggregate assessed-income-tax share for the same band (2021 publication cohort, rescaled by a neutral-ladder heuristic toward your PAP tariff year).',
  },
  loser: {
    title: 'Tax loser',
    className: 'privilege-verdict privilege-verdict--loser',
    blurb:
      'That payroll-income-tax share sits above the tariff-adjusted Destatis band aggregate (2021 publication cohort, rescaled toward your selectable PAP tariff via neutral-ladder **2021 vs anchor-year** payroll shares).',
  },
  typical: {
    title: 'Roughly even',
    className: 'privilege-verdict privilege-verdict--typical',
    blurb:
      'Your payroll tax share is within a couple of points of the tariff-adjusted Destatis aggregate for the band.',
  },
}

const verdictCopyWageSocialBurden: Record<
  TaxOutcomeBand,
  { title: string; blurb: string; className: string }
> = {
  winner: {
    title: 'Burden “winner”',
    className: 'privilege-verdict privilege-verdict--winner',
    blurb:
      'Your all-in PAP burden (tax + employee social) / total income is below the PAP-simulated ladder average. That benchmark is not from Destatis line items — only the Σ Einkommen weights are official. Each anchor uses the same neutral wage model (single, STKL I, no children); your year, insurance path, and capital-income input carry over so the ladder is still comparable to your headline.',
  },
  loser: {
    title: 'Burden “loser”',
    className: 'privilege-verdict privilege-verdict--loser',
    blurb:
      'Your all-in burden share is above that modeled ladder average. The Destatis income-tax table does not publish employee social by band — we cannot build this ladder from official SV without another series. Ladder anchors use a neutral wage earner (single, STKL I, no children); your line is still your scenario.',
  },
  typical: {
    title: 'Along the ladder',
    className: 'privilege-verdict privilege-verdict--typical',
    blurb:
      'Close to the mass-weighted PAP average over the anchors (neutral reference earner at each gross). Use Within band for Destatis income-tax intensity in your slice only.',
  },
}

export default function PrivilegeCheck({
  result,
  settings,
}: {
  result: PapCalculationResult
  settings: PapExplorerSettings
}) {
  const [mode, setMode] = React.useState<PrivilegeComparisonMode>('intra')
  const snap = React.useMemo(() => computePrivilegeSnapshot(settings, result), [settings, result])

  const isIntra = mode === 'intra'
  const verdictSource = isIntra ? verdictCopyIntra : verdictCopyWageSocialBurden
  const band = isIntra ? snap.bandIntra : snap.bandAcrossFull
  const v = verdictSource[band]
  const showLadder = !isIntra && snap.socialLadderRows.length > 0

  const mainStats = isIntra ? (
    snap.destatisBracketLabel !== null &&
    snap.bracketPeerAssessedIncomeTaxPct !== null &&
    snap.bracketPeerAssessedIncomeTaxPctTariffAdjusted !== null ? (
      <p className="privilege-verdict-stats">
        Your payroll tax on salary: <em>{pct(snap.yourPayrollIncomeTaxPct)}</em> · Destatis Σ‑tax / Σ‑Einkommen band{' '}
        {snap.destatisBracketLabel}, publication cohort <strong>{snap.destatisIncomeTaxTableYear}</strong>: raw{' '}
        <strong>{pct(snap.bracketPeerAssessedIncomeTaxPct)}</strong>; uplift from PAP {DESTATIS_INCOME_TABLE_PUBLICATION_YEAR} toward{' '}
        <strong>PAP {snap.staleDestatisIncomeTaxAnchorTariffYear}</strong> (mass‑weighted neutral‑ladder payroll÷gross
        ratio&nbsp;<em>{snap.staleDestatisIncomeTaxUpliftRAnnual.toFixed(3)}</em>, clipped to ×
        <strong>{snap.staleDestatisIncomeTaxMultiplierApprox.toFixed(2)}</strong>; Δ yr vs baseline tariff{' '}
        <strong>{snap.staleDestatisIncomeTaxExponentYears}</strong>):{' '}
        <strong>{pct(snap.bracketPeerAssessedIncomeTaxPctTariffAdjusted)}</strong> — intra‑band verdict uses this uplifted{' '}
        peer only.
      </p>
    ) : (
      <p className="privilege-verdict-stats">No bracket — enter positive salary to compare.</p>
    )
  ) : snap.crossBandWeightedWageBurdenRefPct !== null && result.totalIncome > 0 ? (
    <>
      <p className="privilege-verdict-stats">
        Your burden (tax + employee social / total income): <em>{pct(snap.yourTotalBurdenPct)}</em> ·{' '}
        <strong>PAP ladder average</strong> (single, STKL I, no children at each anchor gross; weighted by Destatis{' '}
        {snap.destatisIncomeTaxTableYear} Σ Einkommen — weights only, not Destatis-measured burdens):{' '}
        <em>{pct(snap.crossBandWeightedWageBurdenRefPct)}</em>
      </p>
      <p className="privilege-verdict-stats privilege-verdict-stats--secondary">
        The first figure follows <strong>your</strong> filing and STKL (it moves when you switch married/single). The
        ladder average stays fixed for the same year, insurance path, and capital income — it does not re-run your
        household split at each anchor.
      </p>
      <p className="privilege-verdict-stats privilege-verdict-stats--secondary">
        Same Destatis table, mass-weighted national <strong>assessed income tax / Einkommen only</strong>: raw cohort{' '}
        {DESTATIS_INCOME_TABLE_PUBLICATION_YEAR}{' '}
        <em>{pct(snap.destatisMassWeightedAssessedIncomeTaxOnlyPct)}</em> · uplifted ×
        {snap.staleDestatisIncomeTaxMultiplierApprox.toFixed(2)} ≈{' '}
        <em>{pct(snap.destatisMassWeightedAssessedIncomeTaxOnlyPctTariffAdjusted)}</em> — publication has{' '}
        <strong>no</strong> employee social; not comparable to your all-in headline.
      </p>
    </>
  ) : (
    <p className="privilege-verdict-stats">No benchmark — enter salary and/or investment income to compare.</p>
  )

  const secondaryStats = isIntra ? (
    <p className="privilege-verdict-stats privilege-verdict-stats--secondary">
      Full wage model burden (tax + employee social): <em>{pct(snap.yourWageBurdenPct)}</em> — not in Destatis
      income-tax line above.
    </p>
  ) : (
    <p className="privilege-verdict-stats privilege-verdict-stats--secondary">
      Wage-only slice: payroll tax <em>{pct(snap.yourPayrollIncomeTaxPct)}</em> · employee social{' '}
      <em>{pct(snap.yourEmployeeSocialPct)}</em>
      {snap.hasCapitalIncome ? (
        <>
          {' '}
          · wage-only tax+social / salary <em>{pct(snap.yourWageBurdenPct)}</em> — headline uses total income (incl.
          capital).
        </>
      ) : null}
    </p>
  )

  return (
    <details className="privilege-panel" open>
      <summary className="privilege-summary">Tax winner or loser?</summary>
      <div className="privilege-body">
        <div className="privilege-mode-toggle" role="group" aria-label="Comparison basis">
          <button
            type="button"
            className={`privilege-mode-btn${isIntra ? ' privilege-mode-btn--active' : ''}`}
            onClick={() => setMode('intra')}
          >
            Within band
          </button>
          <button
            type="button"
            className={`privilege-mode-btn${!isIntra ? ' privilege-mode-btn--active' : ''}`}
            onClick={() => setMode('wageSocialBurden')}
          >
            Wage + social burden
          </button>
        </div>
        <p className="privilege-mode-hint">
          {isIntra ? (
            <>
              <strong>Within band:</strong> payroll <em>income tax</em> intensity vs Destatis peers in the same Einkommen
              slice.
            </>
          ) : (
            <>
              <strong>Wage + social burden:</strong> headline compares your PAP <em>tax + employee social</em> to a{' '}
              <em>PAP-only</em> average over the same anchor ladder; each ladder cell uses a <strong>neutral reference</strong>{' '}
              earner (single, STKL I, no children) so the benchmark does not move when you change filing or family STKL.
              Destatis gives <strong>Σ Einkommen weights</strong>, not measured SV or combined burdens. Official SV-by-Einkommen
              would need another Destatis table. Table columns = model rates. Midpoint stays in-band; model gross may use a{' '}
              {MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR.toLocaleString()} EUR floor.
            </>
          )}
        </p>

        <div className={v.className}>
          <strong className="privilege-verdict-title">{v.title}</strong>
          <p className="privilege-verdict-blurb">{v.blurb}</p>
          {mainStats}
          {secondaryStats}
        </div>

        {showLadder ? (
          <div className="privilege-ladder-wrap">
            <p className="privilege-ladder-caption">
              <strong>Midpoint</strong> = center of each Destatis Einkommen band (stays inside the range).{' '}
              <strong>Model gross</strong> = RE4 we actually run through PAP; if the midpoint is below{' '}
              {MIN_DESTATIS_LADDER_EVALUATION_GROSS_EUR.toLocaleString()} EUR (italic rows), we use that minimum so
              contribution % of gross does not blow up. Your band: <strong>{snap.destatisBracketLabel ?? '—'}</strong>.{' '}
              <strong>Social %</strong> and <strong>tax + social %</strong> are PAP outputs for that neutral earner at each
              anchor, not Destatis-measured. Last column = (PAP tax + employee social) / total model income
              {snap.hasCapitalIncome ? ' (denominator includes your investment at every wage)' : ''}.
            </p>
            <div className="privilege-ladder-scroll">
              <table className="privilege-ladder-table">
                <thead>
                  <tr>
                    <th scope="col">Einkommen band (Destatis)</th>
                    <th scope="col">Midpoint</th>
                    <th scope="col">Model gross</th>
                    <th scope="col">Social %</th>
                    <th scope="col">Tax + social % of total</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.socialLadderRows.map((row) => (
                    <tr
                      key={row.bracketLabel}
                      className={[
                        row.isYourBracket ? 'privilege-ladder-row--here' : '',
                        row.usedMinimumEvaluationFloor ? 'privilege-ladder-row--floor' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td>{row.bracketLabel}</td>
                      <td>{row.nominalMidpointEur.toLocaleString()} EUR</td>
                      <td>{row.anchorGross.toLocaleString()} EUR</td>
                      <td>{pct(row.socialPct)}</td>
                      <td>{pct(row.wageBurdenPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <p className="privilege-note">
          <strong>Bracket rule:</strong> we sort you using annual gross RE4 (
          {snap.bracketPlacementBasisEur.toLocaleString()} EUR
          {snap.marriedHouseholdNote ? ', household sum for married' : ''}) into the same euro bands as Destatis{' '}
          <em>Einkommen</em> — which mixes many deduction rules. Treat placement as a rough map, not your real tax
          assessment class.
        </p>
        <p className="privilege-note">
          <strong>Peer line (within band):</strong> embedded Destatis Σ assessed income tax ÷ Σ adjusted gross income in that
          band ({snap.destatisIncomeTaxTableYear} publication slice) — not your literal neighbours. It excludes social cash.
          The <strong>adjusted</strong> rate rescales that cohort share by the neutral-ladder tariff ratio (mass‑weighted
          payroll tax ÷ gross at your anchor PAP year vs {' '}
          <strong>{DESTATIS_INCOME_TABLE_PUBLICATION_YEAR}</strong> — clipped for display — see{' '}
          <code className="privilege-note-code">neutralLadderStaleDestatisIncomeTaxMultiplier</code> in the source).
        </p>
        <p className="privilege-one-liner">
          <strong>FT benchmarks</strong> ({PRIVILEGE_INCOME_SOURCE_LABEL}; same spline as the wage chart): wage rank{' '}
          <strong>p{snap.incomePercentile.toFixed(1)}</strong> · payroll-tax-on-salary rank{' '}
          <strong>
            {snap.payrollTaxPctPercentileVersusFtWageSpline !== null
              ? `p${snap.payrollTaxPctPercentileVersusFtWageSpline.toFixed(1)}`
              : '—'}
          </strong>
          .
        </p>
        <p className="privilege-note">
          <strong>Tax rank</strong> is not from Destatis tax microdata — we rerun PAP at gross levels matched to wage
          percentiles p1–p99 (interpolated between published Destatis breakpoints), holding <strong>your</strong>{' '}
          settings fixed, compare your payroll tax ÷ salary to those ninety-nine modeled ratios with a midrank. Higher{' '}
          <strong>p</strong> ⇒ heavier withholding vs that synthetic ladder.
        </p>
        {snap.hasCapitalIncome ? (
          <p className="privilege-note">
            Capital income is included in the cross-band headline and ladder last column (same € amount assumed at every
            wage anchor; ladder tax still uses the neutral single / STKL I / no-children profile). Within-band comparison
            stays payroll tax <strong>on salary</strong> vs Destatis income-tax ratios only.
          </p>
        ) : null}
        <p className="privilege-source">
          Playful label, not tax advice. Einkommen tax bands:{' '}
          <a
            href="https://www.destatis.de/EN/Themes/Government/Taxes/Wage-Income-Tax/Tables/annual-income-tax-statistics.html"
            target="_blank"
            rel="noreferrer"
          >
            Destatis annual income tax statistics (EN table)
          </a>
          ; wage ladder:{' '}
          <a
            href="https://www.destatis.de/DE/Presse/Pressemitteilungen/2025/04/PD25_134_621.html"
            target="_blank"
            rel="noreferrer"
          >
            PM 134/2025
          </a>
          .
        </p>
      </div>
    </details>
  )
}
