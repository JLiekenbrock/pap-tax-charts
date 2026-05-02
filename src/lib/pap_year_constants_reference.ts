/**
 * Snapshot of MPARA‑style parameters our **TypeScript PAP port** uses for each modelled tariff year.
 * Keep in sync with values in `./pap.ts` literals and (where present) `Lohnsteuer{year}.xml` **MPARA** / **MZTABFB**.
 *
 * This is **not** a full restatement of every PAP constant (e.g. STKL V/VI progression knots, every rate table).
 */
import { JAEG_2021, JAEG_2025, JAEG_2026, reichenTariffXThresholdForYear } from './pap'

export type PapPortTariffYear = 2021 | 2025 | 2026

export type PapMparaTableRow = {
  year: PapPortTariffYear
  /** `Stand` from the corresponding BMF XML envelope (authoritative date of that PAP file). */
  papXmlStand: string
  gfbEUR: number
  /** Kinderfreibetrag / **KFB** as implemented here (see footnotes in UI). */
  kfbSummary: string
  /** Entlastungsbetrag Alleinerziehend in **MZTABFB** (STKL II). */
  efaStkl2EUR: number
  /** Sonderausgaben‑Pauschbetrag in this port. */
  sapEUR: number
  /** Solidaritätszuschlag Freigrenze **before** × **KZTAB** in **MSOLZ** (per “head” in splitting). */
  solzFreigrenzeBasisEUR: number
  /** Allgemeine Renten‑BBG (west; **KRV = 0**) for **UPEVP** / caps in this port. */
  bbgrvWestEUR: number
  bbgKvPvEUR: number
  /** JAEG for PKV warnings only in the app (not Lohnsteuer tariff). */
  jaegEUR: number
  /** ⌊ZVE / KZTAB⌋ threshold where **45 %** marginal block starts (**UPTAB** knot). */
  tariffTopBracketXEUR: number
}

export const PAP_MPARA_TABLE_ROWS: ReadonlyArray<PapMparaTableRow> = [
  {
    year: 2021,
    papXmlStand: '2020-11-03',
    gfbEUR: 9744,
    kfbSummary: '8388 €/Kind (STKL I–III,V); 4194 € (STKL IV); 0 (STKL V/VI)',
    efaStkl2EUR: 1908,
    sapEUR: 36,
    solzFreigrenzeBasisEUR: 16956,
    bbgrvWestEUR: 85200,
    bbgKvPvEUR: 58050,
    jaegEUR: JAEG_2021,
    tariffTopBracketXEUR: reichenTariffXThresholdForYear(2021),
  },
  {
    year: 2025,
    papXmlStand: '(see `Lohnsteuer2025.xml`)',
    gfbEUR: 12096,
    kfbSummary: '9600 €/Kind (uniform in this port; full **MZTABFB**‑STKL split not mirrored)',
    efaStkl2EUR: 4260,
    sapEUR: 36,
    solzFreigrenzeBasisEUR: 19950,
    bbgrvWestEUR: 96600,
    bbgKvPvEUR: 66150,
    jaegEUR: JAEG_2025,
    tariffTopBracketXEUR: reichenTariffXThresholdForYear(2025),
  },
  {
    year: 2026,
    papXmlStand: '(see `Lohnsteuer2026.xml`)',
    gfbEUR: 12348,
    kfbSummary: '9756 €/Kind (uniform in this port)',
    efaStkl2EUR: 4260,
    sapEUR: 36,
    solzFreigrenzeBasisEUR: 20350,
    bbgrvWestEUR: 101400,
    bbgKvPvEUR: 69750,
    jaegEUR: JAEG_2026,
    tariffTopBracketXEUR: reichenTariffXThresholdForYear(2026),
  },
]

export function formatEurInt(n: number): string {
  return `${n.toLocaleString('de-DE')} €`
}
