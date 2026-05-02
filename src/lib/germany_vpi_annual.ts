/**
 * Deutschland **Verbraucherpreisindex** (gesamt), **Jahresdurchschnitt**, **Basisjahr 2020 = 100**.
 * Source bundle: Destatis Kurzserie (z. B. Tabelle Gesamtindex je Jahr bis **2025**); **2026** is a **provisional**
 * approximatio (average Jan–Mar index levels reported in monthly tables, not JD).
 */

const VPI_JD_PUBLISHED_END = 2025

/** Jahresmittel Deutschland, VPI Basis 2020=100 — Destatis JD where published. */
const VPI_JAHRESMITTEL_AB_2021: ReadonlyArray<readonly [number, number]> = [
  [2021, 103.1],
  [2022, 110.2],
  [2023, 116.7],
  [2024, 119.3],
  [2025, 121.9],
]

/**
 * Rough **2026** level (average of published Jan 122.8, Feb 123.1, Mrz 124.5 from Destatis table **VPI insgesamt**)
 * until Jahresmittel 2026 is available — revise when Destatis publishes JD.
 */
const VPI_PROVISIONAL_MONTHLY_CLUSTER_2026 = (122.8 + 123.1 + 124.5) / 3

const VPI_BY_YEAR = new Map<number, number>([
  [2020, 100.0],
  ...VPI_JAHRESMITTEL_AB_2021,
  [2026, Math.round(VPI_PROVISIONAL_MONTHLY_CLUSTER_2026 * 100) / 100],
])

/** Years we map to a numeric index **with** extrapolation hacks for fringe tariff years inside the app (2026). */
export function vpiDeutschlandJahresmittel(year: number): number {
  if (!Number.isFinite(year)) throw new RangeError(`vpi: non-finite year`)
  const direct = VPI_BY_YEAR.get(year)
  if (direct != null) return direct

  if (year < 2021) return VPI_BY_YEAR.get(2020)!
  if (year > 2026) {
    /** Forward use last anchored index rather than projecting — callers should revisit when Destatis publishes. */
    return VPI_BY_YEAR.get(VPI_JD_PUBLISHED_END + 1)!
  }

  /** Unlisted interior year (none today) linear blend neighbours */
  const lo = Math.floor(year)
  const hi = Math.ceil(year)
  const vl = VPI_BY_YEAR.get(lo)
  const vh = VPI_BY_YEAR.get(hi)
  if (vl != null && vh != null && lo !== hi) return vl + (vh - vl) * (year - lo)
  return vl ?? vh ?? VPI_BY_YEAR.get(2025)!
}

/** **Nominal EUR** tariff-year salaries that match **Konstant€** at **baseYear** purchasing power (`Preisbasis base`). */
export function nominalEuroFromRealEuro(realEuro: number, tariffYear: number, priceBaseYear: number): number {
  if (!(realEuro >= 0) || !Number.isFinite(realEuro)) return 0
  const iT = vpiDeutschlandJahresmittel(tariffYear)
  const iB = vpiDeutschlandJahresmittel(priceBaseYear)
  if (!(iB > 0)) return realEuro
  return Math.round(realEuro * (iT / iB))
}

/** Inverse mapping: express **nominalEuro** tariff-year cash in constant **priceBaseYear** euros. */
export function realEuroFromNominalEuro(nominalEuro: number, tariffYear: number, priceBaseYear: number): number {
  if (!(nominalEuro >= 0) || !Number.isFinite(nominalEuro)) return 0
  const iT = vpiDeutschlandJahresmittel(tariffYear)
  const iB = vpiDeutschlandJahresmittel(priceBaseYear)
  if (!(iT > 0)) return nominalEuro
  return Math.round(nominalEuro * (iB / iT))
}

export const REAL_INCOME_PRICE_BASE_YEAR_CHOICES = [2021, 2025, 2026] as const

export type RealIncomePriceBaseYear = (typeof REAL_INCOME_PRICE_BASE_YEAR_CHOICES)[number]
