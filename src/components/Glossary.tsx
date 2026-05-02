import React from 'react'
import { PAP_MPARA_TABLE_ROWS, formatEurInt, type PapMparaTableRow } from '../lib/pap_year_constants_reference'

type Entry = { term: string; def: React.ReactNode }

const ENTRIES: ReadonlyArray<Entry> = [
  {
    term: 'PAP',
    def: (
      <>
        <em>Programmablaufplan</em> for payroll tax (<i>Lohnsteuer</i>): the official flow your app implements
        locally, without calling the BMF web service at runtime.
      </>
    ),
  },
  {
    term: 'RE4',
    def: 'Annual gross employment income in the PAP sense (the main salary input before deductions).',
  },
  {
    term: 'ZVE',
    def: (
      <>
        <i>Zu versteuerndes Einkommen</i>: taxable income. Here, roughly RE4 minus the employee lump-sum allowance (
        <i>ZTABFB</i>) minus <i>Vorsorgepauschale</i> (<strong>VSP</strong>), then the income-tax formula (incl.
        splitting) is applied.
      </>
    ),
  },
  {
    term: 'VSP',
    def: (
      <>
        <i>Vorsorgepauschale</i>: simplified deduction inside the income-tax base, built from pension / health+care /
        unemployment-related pieces under PAP rules. It can differ from actual paycheck contributions when caps apply;
        the app uses separate sums for “real” employee social vs tax-deductible VSP where needed.
      </>
    ),
  },
  {
    term: 'VFRB / WVFRB',
    def: (
      <>
        <i>Vorauszahlungs-</i> and <i>weitere Vorauszahlungsfreibeträge</i>: withholding allowances in the PAP slice
        (roughly what reduces withholding relative to the raw tariff on ZVE).
      </>
    ),
  },
  {
    term: 'STKL',
    def: (
      <>
        <i>Steuerklasse</i> (tax class I–VI): drives withholding rates and allowances in the payroll path.
      </>
    ),
  },
  {
    term: 'BBG',
    def: (
      <>
        <i>Beitragsbemessungsgrenze</i>: statutory cap on wages used for social-insurance contribution bases (RV,
        GKV, AV, …) per year.
      </>
    ),
  },
  {
    term: 'RV / GKV / AV',
    def: (
      <>
        Statutory pension (<i>Rentenversicherung</i>), statutory health insurance (<i>Gesetzliche
        Krankenversicherung</i>), unemployment (<i>Arbeitslosenversicherung</i>). PKV is private health; the PAP path
        can model net PKV cost instead of GKV percentages.
      </>
    ),
  },
  {
    term: 'Abgeltung / Kapitalertragsteuer',
    def: (
      <>
        Flat withholding on many capital returns (often 25% plus additions); the app can mix this with wage income in
        total burden figures. It is not the same slice as payroll PAP.
      </>
    ),
  },
  {
    term: 'Destatis (in this app)',
    def: (
      <>
        References to Statistisches Bundesamt tables (e.g. assessed income tax by income band) used only for
        benchmarks in Privilege Check, not for running PAP itself.
      </>
    ),
  },
  {
    term: 'VPI',
    def: (
      <>
        <i>VPI</i>: <i>Verbrauchspreisindex</i> Deutschland (Destatis national consumer‑price series). This explorer uses{' '}
        published <strong>Jahresmittel</strong> index levels (<strong>basis 2020 = 100</strong>), bundled in{' '}
        <code>germany_vpi_annual.ts</code>. Turning <strong>nominal</strong> cash at tariff year <em>y</em> into{' '}
        <strong>Konstant‑EUR</strong> at price‑base year <em>B</em>: multiply by{' '}
        <em>VPI(B)&nbsp;/&nbsp;VPI(y)</em> (whole euros rounded). The <strong>reciprocal</strong> maps Konstant wages back to
        tariff‑year nominal gross for PAP (“Real salaries”). Not the same datasets as wage benchmarks in Privilege Check.
      </>
    ),
  },
  {
    term: 'Beamtenmodus',
    def: (
      <>
        Shortcut: no RV/ALV in the PAP path (<code>krv</code>/<code>alv</code>), PKV + Beihilfe preset. Ladder
        benchmarks reuse the same insurance flags so “references” move with that profile.
      </>
    ),
  },
]

function mparaCols(r: PapMparaTableRow) {
  return {
    meta: `${r.year} (${r.papXmlStand})`,
    gfb: formatEurInt(r.gfbEUR),
    kfb: r.kfbSummary,
    efa: formatEurInt(r.efaStkl2EUR),
    sap: formatEurInt(r.sapEUR),
    solz: formatEurInt(r.solzFreigrenzeBasisEUR),
    bbgRv: formatEurInt(r.bbgrvWestEUR),
    bbgKv: formatEurInt(r.bbgKvPvEUR),
    jaeg: formatEurInt(r.jaegEUR),
    x45: formatEurInt(r.tariffTopBracketXEUR),
  }
}

/**
 * Abbreviations and model terms used across charts, results, and PAP code.
 */
export default function Glossary() {
  return (
    <details className="glossary-panel">
      <summary className="glossary-summary">Glossary</summary>
      <div className="glossary-body">
        <h3 className="glossary-inline-heading">PAP parameters by tariff year</h3>
        <p className="glossary-note">
          Values below match the constants wired into{' '}
          <code>pap.ts</code> / <code>Lohnsteuer2021.xml</code> <strong>MPARA</strong> (and analogous years where we model them).
          JAEG is for PKV UI hints only — it is <strong>not</strong> an input to tariff <strong>UPTAB</strong> in payroll
          PAP.
        </p>
        <div className="glossary-table-wrap glossary-table-wrap--scroll">
          <table className="glossary-table pap-mpara-years-table">
            <thead>
              <tr>
                <th scope="col">Tariff&nbsp;year / PAP Stand</th>
                <th scope="col">GFB</th>
                <th scope="col">KFB (this app)</th>
                <th scope="col">
                  EFA&nbsp;STKL II
                </th>
                <th scope="col">SAP</th>
                <th scope="col">
                  SOLZ Freigrenze¹
                </th>
                <th scope="col">BBG RV²</th>
                <th scope="col">BBG KV/PV</th>
                <th scope="col">
                  JAEG³
                </th>
                <th scope="col">
                  45 % knot ⌊X⌋
                </th>
              </tr>
            </thead>
            <tbody>
              {PAP_MPARA_TABLE_ROWS.map((r) => {
                const c = mparaCols(r)
                return (
                  <tr key={r.year}>
                    <th scope="row">{c.meta}</th>
                    <td>{c.gfb}</td>
                    <td className="pap-mpara-years-table__kfb">{c.kfb}</td>
                    <td>{c.efa}</td>
                    <td>{c.sap}</td>
                    <td>{c.solz}</td>
                    <td>{c.bbgRv}</td>
                    <td>{c.bbgKv}</td>
                    <td>{c.jaeg}</td>
                    <td>{c.x45}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <ol className="glossary-mpara-notes">
          <li>
            <strong>Solidaritätszuschlag:</strong> Freigrenze is multiplied by <strong>KZTAB</strong> inside{' '}
            <strong>MSOLZ</strong> before comparing to withholding tax bases.
          </li>
          <li>
            <strong>RV BBG:</strong> Western general scheme (<strong>KRV = 0</strong>). A lower east‑scheme cap existed in law
            for some years — not split in this explorer.
          </li>
          <li>
            <strong>JAEG</strong> = allgemeine Versicherungspflichtgrenze — only drives PKV‑eligibility messaging here.
          </li>
        </ol>

        <div className="glossary-table-wrap">
          <table className="glossary-table">
            <tbody>
              {ENTRIES.map((e) => (
                <tr key={e.term}>
                  <th scope="row">{e.term}</th>
                  <td>{e.def}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  )
}
