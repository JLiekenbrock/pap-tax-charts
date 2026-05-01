export type PapOptions = {
  year?: number
  filing?: 'single' | 'married'
  children?: number
  stkl?: 1 | 2 | 3 | 4 | 5 | 6
  solidarity?: boolean
  churchRate?: number // e.g. 0.09 for 9%
  kvz?: number // statutory health insurance additional contribution rate in percent, e.g. 1.7
  pvs?: 0 | 1 // 1 for Saxony long-term care insurance special rate
  pvz?: 0 | 1 // 1 if childless care-insurance surcharge applies
  pva?: number // child-related care-insurance reduction factor used by PAP
  krv?: 0 | 1 // 1 disables statutory pension-insurance partial amount
  alv?: 0 | 1 // 1 disables unemployment-insurance cap path
  pkv?: 0 | 1 | 2 // private insurance mode; 0 means statutory
  pkpv?: number // monthly private basic health/care premium in cents
  pkpvagz?: number // monthly employer subsidy for private insurance in cents
  investmentIncome?: number // annual investment income in EUR
  /**
   * Pro-mode override for the Beitragsbemessungsgrenze KV/PV (annual EUR).
   * If unset, the year-specific default is used. Use this to model future
   * reform scenarios (e.g. the EUR 300/month outsized hike from the 2026
   * Kabinettsbeschluss).
   */
  bbgKvPv?: number
  /** Pro-mode override for the BBG RV/AV (annual EUR). */
  bbgRvAlv?: number
  /**
   * Pro-mode override for the Jahresarbeitsentgeltgrenze (JAEG, annual EUR).
   * Affects only the PKV-eligibility warning, not the calculation itself.
   */
  jaeg?: number
}

// Reasonable default assumptions (documented):
// - default year 2026
// - child allowance used as a simple deduction per child (approximation)
// - solidarity (Solz) threshold for 2026: 20350 EUR (as in Lohnsteuer2026 excerpt)
// These are approximations until the full PAP port is added.

// Default values for the *core* PAP options. The pro-mode override fields
// (bbgKvPv, bbgRvAlv, jaeg) intentionally have no default — when absent, the
// year-specific constants (BBGKVPV_2026 etc.) are used inside the calc.
type CoreDefaults = Required<Omit<PapOptions, 'bbgKvPv' | 'bbgRvAlv' | 'jaeg'>>
const DEFAULTS: CoreDefaults = {
  year: 2026,
  filing: 'single',
  children: 0,
  stkl: 1,
  solidarity: true,
  churchRate: 0,
  kvz: 0,
  pvs: 0,
  pvz: 0,
  pva: 0,
  krv: 0,
  alv: 0,
  pkv: 0,
  pkpv: 0,
  pkpvagz: 0,
  investmentIncome: 0,
}

// MPARA constants / PAP tables (partial)
const GFB_2025 = 12096 // Grundfreibetrag (GFB) from MPARA for 2025
const GFB_2026 = 12348 // Grundfreibetrag (GFB) from MPARA for 2026
const W1STKL5 = 13785
const W2STKL5 = 34240
const W3STKL5 = 222260

// KFB: child allowance per child in PAP (2025 uses 9600 per child in MZTABFB when applicable)
const KFB_PER_CHILD_2025 = 9600
const KFB_PER_CHILD_2026 = 9756
const SOLZ_FREE_2025 = 19950
const SOLZ_FREE_2026 = 20350

/**
 * Allgemeine Jahresarbeitsentgeltgrenze (JAEG) — the gross-salary
 * threshold above which an employee may leave the GKV and switch to a
 * private health insurer (PKV). Civil servants and the self-employed
 * are exempt from this rule.
 *
 * The "besondere" JAEG (EUR 69,750 for 2026) is intentionally not
 * modelled here since it only applies to people who were already PKV-
 * insured on 2002-12-31 and is therefore irrelevant for any modern
 * decision the user might explore.
 */
export const JAEG_2025 = 73_800
export const JAEG_2026 = 77_400

export function jaegFor(year: number, override?: number): number {
  if (typeof override === 'number' && override > 0) return override
  return year === 2026 ? JAEG_2026 : JAEG_2025
}

/**
 * Solidaritätszuschlag on wage tax / income tax, per SolZG §4.
 *
 * Three regimes:
 *   1. base <= Freigrenze            → 0
 *   2. Freigrenze < base < ~1.86×F   → 11.9 % of (base − Freigrenze)  (Milderungszone)
 *   3. base above the taper          → 5.5 % of base                  (regular rate)
 *
 * Without the Milderungszone the soli would jump from 0 to ~5.5 %·F at the
 * threshold, producing the visible "spike" in our charts.
 */
function computeWageSoli(base: number, solidarity: boolean, year: number, kztab: number): number {
  if (!solidarity) return 0
  const solzFreePerHead = year === 2026 ? SOLZ_FREE_2026 : SOLZ_FREE_2025
  const solzFree = solzFreePerHead * kztab
  if (base <= solzFree) return 0
  const standard = base * 0.055
  const taper = (base - solzFree) * 0.119
  return Math.round(Math.min(standard, taper))
}

const BBGRVALV_2025 = 96600
const BBGKVPV_2025 = 66150
const BBGRVALV_2026 = 101400
const BBGKVPV_2026 = 69750
const AVSATZAN_2026 = 0.013
const RVSATZAN_2026 = 0.093
const KVSATZAN_2026 = 0.07
const PVSATZAN_2026 = 0.018

export type PapCalculationResult = {
  income: number
  investmentIncome: number
  totalIncome: number
  stkl: number
  year: number
  kztab: number
  gfb: number
  anp: number
  efa: number
  sap: number
  kfb: number
  ztabfb: number
  vsp: number
  zre4vp: number
  vspRenten: number
  vspKrankenPflege: number
  vspArbeitslosen: number
  vsphb: number
  vspn: number
  zve: number
  vfrb: number
  wvfrb: number
  /** Pure income-tax bracket result (UPTAB), before Soli, church, or capital gains. */
  base: number
  /** `base + investmentTax`. Kept for backward compatibility — prefer `base` for the income-tax row in UIs. */
  baseTax: number
  payrollTax: number
  investmentTaxable: number
  saverAllowance: number
  investmentTax: number
  investmentSolz: number
  investmentChurch: number
  solz: number
  church: number
  tax: number
  lstlzz: number
}

// Core implementation: port of UPTAB25() (tariff 2025) from the PAP implementation
// This function implements the tariff pieces and rounding strategy used in the Java source.
function uptab25(zve: number, kztab = 1): number {
  // KZTAB=1 for Grundtarif, 2 for splitting. The PAP code floors X = ZVE / KZTAB.
  const GFB = 12096 // Grundfreibetrag for 2025 (from MPARA)

  const X = Math.floor(zve / kztab)
  let st = 0

  // If below or equal GFB -> zero
  if (X < GFB + 1) {
    st = 0
  } else if (X < 17444) {
    const Y = (X - GFB) / 10000
    const RW = Y * 932.30 + 1400
    st = Math.floor(RW * Y)
  } else if (X < 68481) {
    // note: subtract 17443 as in the Java implementation
    const Y = (X - 17443) / 10000
    const RW = Y * 176.64 + 2397
    st = Math.floor(RW * Y + 1015.13)
  } else if (X < 277826) {
    st = Math.floor(X * 0.42 - 10911.92)
  } else {
    st = Math.floor(X * 0.45 - 19246.67)
  }

  return st * kztab
}

// Core implementation: port of UPTAB26() (tariff 2026) from the PAP implementation.
function uptab26(zve: number, kztab = 1): number {
  const X = Math.floor(zve / kztab)
  let st = 0

  if (X < GFB_2026 + 1) {
    st = 0
  } else if (X < 17800) {
    const Y = Math.trunc(((X - GFB_2026) / 10000) * 1_000_000) / 1_000_000
    const RW = Y * 914.51 + 1400
    st = Math.floor(RW * Y)
  } else if (X < 69879) {
    const Y = Math.trunc(((X - 17799) / 10000) * 1_000_000) / 1_000_000
    const RW = (Y * 173.1 + 2397) * Y
    st = Math.floor(RW + 1034.87)
  } else if (X < 277826) {
    st = Math.floor(X * 0.42 - 11135.63)
  } else {
    st = Math.floor(X * 0.45 - 19470.38)
  }

  return st * kztab
}

export function calculatePapTax(income: number, opts?: PapOptions): number {
  const o = { ...DEFAULTS, ...(opts || {}) }
  const incomeNonNeg = Math.max(0, income)

  // Apply child allowance using PAP KFB per child for 2025 (temporary - full MZTABFB will replace this)
  const kfb = o.year === 2026 ? KFB_PER_CHILD_2026 : KFB_PER_CHILD_2025
  const taxable = Math.max(0, incomeNonNeg - (o.children || 0) * kfb)

  // Splitting (married) handled by computing tax on half the income and doubling
  if (o.filing === 'married') {
    const half = taxable / 2
    return Math.round(2 * calculatePapTax(half, { ...o, filing: 'single', children: 0 }))
  }

  // Single filer: compute tariff using UPTAB25 when year is 2025 (default)
  if (o.year === 2025 || o.year === 2026) {
    const kztab = o.filing === 'married' || o.stkl === 3 ? 2 : 1
    const base = o.year === 2026 ? uptab26(taxable, kztab) : uptab25(taxable, kztab)
    const solz = computeWageSoli(base, o.solidarity, o.year, kztab)
    const church = Math.round(base * (o.churchRate || 0))
    const payrollTax = base + solz + church
    const saverAllowance = o.filing === 'married' ? 2000 : 1000
    const investmentTaxable = Math.max(0, (o.investmentIncome || 0) - saverAllowance)
    const investmentTax = Math.round(investmentTaxable * 0.25)
    const investmentSolz = o.solidarity ? Math.round(investmentTax * 0.055) : 0
    const investmentChurch = Math.round(investmentTax * (o.churchRate || 0))
    return payrollTax + investmentTax + investmentSolz + investmentChurch
  }

  // Fallback: simple progressive approximation when not 2025
  const z = (taxable - 10908) / 10000
  const rate = 0.14 + 0.28 * Math.min(1, Math.max(0, z) / 4)
  const payrollTax = Math.round(Math.max(0, taxable - 10908) * rate)
  const saverAllowance = o.filing === 'married' ? 2000 : 1000
  const investmentTaxable = Math.max(0, (o.investmentIncome || 0) - saverAllowance)
  const investmentTax = Math.round(investmentTaxable * 0.25)
  const investmentSolz = o.solidarity ? Math.round(investmentTax * 0.055) : 0
  const investmentChurch = Math.round(investmentTax * (o.churchRate || 0))
  return payrollTax + investmentTax + investmentSolz + investmentChurch
}

// --- Start PAP flow helpers (simplified MZTABFB + UPEVP + MLSTJAHR) ---

function computeFixedAllowances(re4: number, opts?: PapOptions) {
  const o = { ...DEFAULTS, ...(opts || {}) }
  // child allowance: KFB per child (for 2025 use KFB_PER_CHILD_2025)
  const kfbPerChild = o.year === 2026 ? KFB_PER_CHILD_2026 : KFB_PER_CHILD_2025
  const kfb = kfbPerChild * (o.children || 0)

  // EFA (Entlastungsbetrag für Alleinerziehende) simplified: apply only for stkl == 2 (married but special)
  const efa = o.stkl === 2 ? 4260 : 0
  const anp = o.stkl && o.stkl < 6 && re4 > 0 ? Math.min(Math.ceil(re4), 1230) : 0

  // SAP (Solidaritätsbereinigungs-Pauschbetrag) simplified constant used in PAP excerpts (SAP = 36 for 2025)
  const sap = 36

  // ZTABFB is sum of EFA + ANP (here approximated as 0) + SAP + KFB
  const ztabfb = Math.floor(efa + anp + sap + kfb)
  return { anp, efa, sap, kfb, ztabfb }
}

// Compute fixed table allowances (ZTABFB) per PAP MZTABFB simplified rules.
// Returns ZTABFB in euros (rounded down to integer euros as PAP often uses integer cents/euros semantics)
export function computeZTABFB(re4: number, opts?: PapOptions): number {
  const { ztabfb } = computeFixedAllowances(re4, opts)
  return ztabfb
}

function computeVorsorgeDetails(re4: number, opts?: PapOptions) {
  const o = { ...DEFAULTS, ...(opts || {}) }
  // Only 2025 and 2026 implement the split RV / KV+PV / AV lines used by charts
  // (decomposition, Results). Other years keep a coarse placeholder VSP.
  if (o.year !== 2025 && o.year !== 2026) {
    const vsp = Math.floor(Math.min(Math.floor(re4 * 0.02), 3000))
    return {
      vsp,
      zre4vp: Math.max(0, re4),
      vspRenten: 0,
      vspKrankenPflege: vsp,
      vspArbeitslosen: 0,
      vsphb: 0,
      vspn: vsp,
    }
  }

  const zre4vp = Math.max(0, re4)
  const defaultRv = o.year === 2026 ? BBGRVALV_2026 : BBGRVALV_2025
  const defaultKv = o.year === 2026 ? BBGKVPV_2026 : BBGKVPV_2025
  const bbgRvAlv = opts?.bbgRvAlv ?? defaultRv
  const bbgKvPv = opts?.bbgKvPv ?? defaultKv
  const zre4vprRv = Math.min(zre4vp, bbgRvAlv)
  const vspRenten = o.krv === 1 ? 0 : Math.floor(zre4vprRv * RVSATZAN_2026 * 100) / 100

  const zre4vprKvPv = Math.min(zre4vp, bbgKvPv)
  let pvsatzan = o.pvs === 1 ? 0.023 : PVSATZAN_2026
  pvsatzan = o.pvz === 1 ? pvsatzan + 0.006 : pvsatzan - o.pva * 0.0025
  const kvsatzan = KVSATZAN_2026 + (o.kvz / 2) / 100

  let vspKrankenPflege = 0
  if (o.pkv > 0) {
    if (o.stkl !== 6) {
      const pkpvagzj = Math.floor((o.pkpvagz * 12 / 100) * 100) / 100
      const pkpvj = Math.floor((o.pkpv * 12 / 100) * 100) / 100
      vspKrankenPflege = Math.max(0, Math.floor((pkpvj - pkpvagzj) * 100) / 100)
    }
  } else {
    vspKrankenPflege = Math.floor(zre4vprKvPv * (kvsatzan + pvsatzan) * 100) / 100
  }

  let vsp = Math.ceil(vspKrankenPflege + vspRenten)
  let vspArbeitslosen = 0
  let vsphb = 0
  let vspn = vsp

  // PAP 2025 UPEVP: compare ceil(VSP3+VSP1) with ceil(VSP1+min(12%·ZRE4RV, VHB));
  // VHB is EUR 3,000 only in Steuerklasse III, else EUR 1,900 (Lohnsteuer2025.xml).
  // PAP 2026 replaces this with MVSPHB (ALV+KV cap EUR 1,900 for all STKL).
  const pap2025GkVPath = o.year === 2025 && o.pkv === 0

  if (pap2025GkVPath) {
    const zFor12 = o.krv === 1 ? zre4vp : zre4vprRv
    const vsp1 = vspRenten
    const vsp2 = Math.min(Math.floor(zFor12 * 0.12 * 100) / 100, o.stkl === 3 ? 3000 : 1900)
    const vspNTwelfth = Math.ceil((vsp1 + vsp2) * 100) / 100
    const vspDetail = Math.ceil((vspKrankenPflege + vsp1) * 100) / 100
    vsp = vspNTwelfth > vspDetail ? Math.floor(vspNTwelfth * 100) / 100 : vspDetail
    vspn = vspNTwelfth
    vsphb = vsp2
    if (o.alv !== 1 && o.stkl !== 6) {
      vspArbeitslosen = Math.floor(zre4vprRv * AVSATZAN_2026 * 100) / 100
    }
  } else if (o.alv !== 1 && o.stkl !== 6) {
    vspArbeitslosen = Math.floor(zre4vprRv * AVSATZAN_2026 * 100) / 100
    vsphb = Math.min(Math.floor((vspArbeitslosen + vspKrankenPflege) * 100) / 100, 1900)
    vspn = Math.ceil(vspRenten + vsphb)
    if (vspn > vsp) vsp = vspn
  }

  return { vsp, zre4vp, vspRenten, vspKrankenPflege, vspArbeitslosen, vsphb, vspn }
}

// Simplified Vorsorgepauschale (UPEVP): returns VSP in euros (rounded down)
// PAP has a complex calculation; here we implement a very small approximation so taxes reduce.
export function computeVorsorgePauschale(re4: number, opts?: PapOptions): number {
  return computeVorsorgeDetails(re4, opts).vsp
}

export function calculatePapResultFromRE4(re4: number, opts?: PapOptions): PapCalculationResult {
  const o = { ...DEFAULTS, ...(opts || {}) }
  const { anp, efa, sap, kfb, ztabfb } = computeFixedAllowances(re4, o)
  const vspDetails = computeVorsorgeDetails(re4, o)
  const vsp = vspDetails.vsp
  const zve = Math.max(0, Math.floor(re4 - ztabfb - vsp))

  const kztab = o.filing === 'married' || o.stkl === 3 ? 2 : 1
  const gfb = o.year === 2026 ? GFB_2026 : GFB_2025
  const base = o.year === 2026 ? uptab26(zve, kztab) : uptab25(zve, kztab)

  const wageSolz = computeWageSoli(base, o.solidarity, o.year, kztab)
  const wageChurch = Math.round(base * (o.churchRate || 0))
  const payrollTax = base + wageSolz + wageChurch

  const investmentIncome = Math.max(0, o.investmentIncome || 0)
  const saverAllowance = o.filing === 'married' ? 2000 : 1000
  const investmentTaxable = Math.max(0, investmentIncome - saverAllowance)
  const investmentTax = Math.round(investmentTaxable * 0.25)
  const investmentSolz = o.solidarity ? Math.round(investmentTax * 0.055) : 0
  const investmentChurch = Math.round(investmentTax * (o.churchRate || 0))

  const baseTax = base + investmentTax
  const solz = wageSolz + investmentSolz
  const church = wageChurch + investmentChurch
  const tax = payrollTax + investmentTax + investmentSolz + investmentChurch
  const vfrb = Math.floor(anp)
  const wvfrb = Math.max(0, Math.floor(zve - gfb))

  return {
    income: re4,
    investmentIncome,
    totalIncome: re4 + investmentIncome,
    stkl: o.stkl,
    year: o.year,
    kztab,
    gfb,
    anp,
    efa,
    sap,
    kfb,
    ztabfb,
    vsp,
    zre4vp: vspDetails.zre4vp,
    vspRenten: vspDetails.vspRenten,
    vspKrankenPflege: vspDetails.vspKrankenPflege,
    vspArbeitslosen: vspDetails.vspArbeitslosen,
    vsphb: vspDetails.vsphb,
    vspn: vspDetails.vspn,
    zve,
    vfrb,
    wvfrb,
    base,
    baseTax,
    payrollTax,
    investmentTaxable,
    saverAllowance,
    investmentTax,
    investmentSolz,
    investmentChurch,
    solz,
    church,
    tax,
    lstlzz: tax,
  }
}

// MLSTJAHR simplified: compute ZVE = RE4 - ZTABFB - VSP, then call the year tariff.
export function calculatePapTaxFromRE4(re4: number, opts?: PapOptions): number {
  return calculatePapResultFromRE4(re4, opts).tax
}

// --- End helpers ---

export type SeriesPoint = { income: number; tax: number }

export function calculatePapSeries(currentIncome: number, opts?: PapOptions, points = 40): SeriesPoint[] {
  const max = Math.max(50000, currentIncome * 1.5)
  const step = Math.max(1000, Math.round(max / points))
  const series: SeriesPoint[] = []
  for (let inc = 0; inc <= max; inc += step) {
    series.push({ income: inc, tax: calculatePapTax(inc, opts) })
  }
  return series
}

export default {
  calculatePapTax,
  calculatePapResultFromRE4,
  calculatePapSeries,
}
