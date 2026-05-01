import React from 'react'

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
    term: 'Beamtenmodus',
    def: (
      <>
        Shortcut: no RV/ALV in the PAP path (<code>krv</code>/<code>alv</code>), PKV + Beihilfe preset. Ladder
        benchmarks reuse the same insurance flags so “references” move with that profile.
      </>
    ),
  },
]

/**
 * Abbreviations and model terms used across charts, results, and PAP code.
 */
export default function Glossary() {
  return (
    <details className="glossary-panel">
      <summary className="glossary-summary">Glossary</summary>
      <div className="glossary-body">
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
