import React from 'react'
import { PapCalculationResult } from '../lib/pap'
import {
  PRIVILEGE_INCOME_SOURCE_LABEL,
  type TaxOutcomeBand,
  computePrivilegeSnapshot,
} from '../lib/privilege_benchmark'
import type { PapExplorerSettings } from './TaxInput'

function pct(value: number) {
  return `${value.toFixed(1)}%`
}

const verdictCopy: Record<
  TaxOutcomeBand,
  { title: string; blurb: string; className: string }
> = {
  winner: {
    title: 'Tax winner',
    className: 'privilege-verdict privilege-verdict--winner',
    blurb:
      'Your modeled payroll income tax (incl. Soli/church) as a share of salary is lower than the Destatis average assessed income-tax share for others placed in the same income band.',
  },
  loser: {
    title: 'Tax loser',
    className: 'privilege-verdict privilege-verdict--loser',
    blurb:
      'That payroll-income-tax share sits above the Destatis aggregate for the band — so in this crude sense you are “above” typical assessed income tax intensity there.',
  },
  typical: {
    title: 'Roughly even',
    className: 'privilege-verdict privilege-verdict--typical',
    blurb:
      'Your payroll tax share is within a couple of points of the Destatis band aggregate.',
  },
}

export default function PrivilegeCheck({
  result,
  settings,
}: {
  result: PapCalculationResult
  settings: PapExplorerSettings
}) {
  const snap = React.useMemo(() => computePrivilegeSnapshot(settings, result), [settings, result])
  const v = verdictCopy[snap.band]
  const bracketLine =
    snap.destatisBracketLabel !== null && snap.bracketPeerAssessedIncomeTaxPct !== null ? (
      <p className="privilege-verdict-stats">
        Your payroll tax on salary: <em>{pct(snap.yourPayrollIncomeTaxPct)}</em> · Band average (Destatis assessed
        income tax / Einkommen, {snap.destatisIncomeTaxTableYear}, {snap.destatisBracketLabel}):{' '}
        <em>{pct(snap.bracketPeerAssessedIncomeTaxPct)}</em>
      </p>
    ) : (
      <p className="privilege-verdict-stats">No bracket — enter positive salary to compare.</p>
    )

  return (
    <details className="privilege-panel" open>
      <summary className="privilege-summary">Tax winner or loser?</summary>
      <div className="privilege-body">
        <div className={v.className}>
          <strong className="privilege-verdict-title">{v.title}</strong>
          <p className="privilege-verdict-blurb">{v.blurb}</p>
          {bracketLine}
          <p className="privilege-verdict-stats privilege-verdict-stats--secondary">
            Full wage model burden (tax + employee social): <em>{pct(snap.yourWageBurdenPct)}</em> — not in Destatis
            bracket line above.
          </p>
        </div>
        <p className="privilege-note">
          <strong>Bracket rule:</strong> we sort you using annual gross RE4 (
          {snap.bracketPlacementBasisEur.toLocaleString()} EUR
          {snap.marriedHouseholdNote ? ', household sum for married' : ''}) into the same euro bands as Destatis{' '}
          <em>Einkommen</em> — which mixes many deduction rules. Treat placement as a rough map, not your real tax
          assessment class.
        </p>
        <p className="privilege-note">
          <strong>Peer line:</strong> official stat is aggregate assessed income tax divided by aggregate adjusted gross
          income in that band — not your literal neighbors, but everyone filed in that slice in {snap.destatisIncomeTaxTableYear}.
          It does <strong>not</strong> include social-security cash shares.
        </p>
        <p className="privilege-one-liner">
          Your gross vs full-time peers (Verdienst): <em>{pct(snap.incomePercentile)}</em> percentile (
          {PRIVILEGE_INCOME_SOURCE_LABEL}).
        </p>
        {snap.hasCapitalIncome ? (
          <p className="privilege-note">
            Capital income entered — all-in burden (wage + capital in model) is{' '}
            <strong>{pct(snap.yourBurdenPctAllIn)}</strong>; the headline compares <strong>payroll tax on salary</strong>{' '}
            to the Destatis income-tax ratio.
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
