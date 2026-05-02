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
  /**
   * When `filing === 'married'`, treat the first `re4` as earner 1 and this as
   * earner 2: each gets their own Werbungskosten-Pauschale and VSP/BBG path;
   * income tax still uses joint ZVE and Ehegattensplitting (`kztab === 2`).
   * If omitted, the legacy single-RE4 lump (combined gross in one SV run) is used.
   */
  partnerRe4?: number
}

// Reasonable default assumptions (documented):
// - default year 2026
// - child allowance used as a simple deduction per child (approximation)
// - solidarity (Solz) threshold for 2026: 20350 EUR (as in Lohnsteuer2026 excerpt)
// These are approximations until the full PAP port is added.

// Default values for the *core* PAP options. The pro-mode override fields
// (bbgKvPv, bbgRvAlv, jaeg) intentionally have no default — when absent, the
// year-specific constants (BBGKVPV_2026 etc.) are used inside the calc.
type CoreDefaults = Required<Omit<PapOptions, 'bbgKvPv' | 'bbgRvAlv' | 'jaeg' | 'partnerRe4'>>
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
const GFB_2021 = 9744 // Lohnsteuer2021.xml MPARA
const GFB_2025 = 12096 // Grundfreibetrag (GFB) from MPARA for 2025
const GFB_2026 = 12348 // Grundfreibetrag (GFB) from MPARA for 2026
/** STKL V–VI withholding progression knots (middle path), 2025/2026. */
const W1STKL5 = 13785
const W2STKL5 = 34240
const W3STKL5 = 222260

const W1STKL5_2021 = 11237
const W2STKL5_2021 = 28959
const W3STKL5_2021 = 219690

// KFB: child allowance per child in PAP (2025 uses 9600 per child in MZTABFB when applicable)
const KFB_PER_CHILD_2025 = 9600
const KFB_PER_CHILD_2026 = 9756

/** Kinderfreibeträge (EUR/Kind); splits by STKL in 2021 (Lohnsteuer2021.xml MZTABFB). */
function kfbEuroPerKind(opts: PapOptions): number {
  const o = { ...DEFAULTS, ...opts }
  if (o.year === 2026) return KFB_PER_CHILD_2026
  if (o.year === 2021)
    return o.stkl === 4 ? 4194 : o.stkl === 5 || o.stkl === 6 ? 0 : 8388
  return KFB_PER_CHILD_2025 // 2025 + other years fallback
}

function tableEfaEuro(stkl: number, year: number): number {
  if (stkl !== 2) return 0
  if (year === 2021) return 1908
  return 4260
}
const SOLZ_FREE_2021 = 16956 // Lohnsteuer2021.xml MPARA base (then × KZTAB in MSOLZ)
const SOLZ_FREE_2025 = 19950
const SOLZ_FREE_2026 = 20350

const BBGRVALV_2021 = 85200 // western scheme (KRV=0); 80400 for KRV=1 omitted in explorer defaults
const BBGKVPV_2021 = 58050
const TBSVORV_2021 = 0.84

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
export const JAEG_2021 = 64_350
export const JAEG_2025 = 73_800
export const JAEG_2026 = 77_400

export function jaegFor(year: number, override?: number): number {
  if (typeof override === 'number' && override > 0) return override
  if (year === 2026) return JAEG_2026
  if (year === 2025) return JAEG_2025
  if (year === 2021) return JAEG_2021
  return year <= 2021 ? JAEG_2021 : JAEG_2026
}

/** Upper bound for the explorer’s salary / household RE4 domain (EUR) — aligns with headline DAX‑level packages. */
export const MAX_CHART_SALARY_EUR = 10_000_000

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
  const solzFreePerHead =
    year === 2026 ? SOLZ_FREE_2026 : year === 2021 ? SOLZ_FREE_2021 : SOLZ_FREE_2025
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
const PVSATZAN_AN_2021_REG = 0.01525
const PVSATZAN_AN_2021_SAX = 0.02025

/** One spouse in a two-earner married PAP household (employee social breakdown only). */
export type MarriedEarnerSlice = {
  income: number
  vspRenten: number
  vspKrankenPflege: number
  vspArbeitslosen: number
}

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
  /** Subset of **`base`**: UPTAB Euros from the **45 %** block vs extrapolating **42 %** on **⌊ZVE/kztab⌋** (not added to ZVE). */
  reichenTariffEur: number
  /** Payroll overage (LSt+Soli+KiSt on wages) attributable to that UPTAB slice; still part of **`payrollTax`**, not ZVE. */
  reichenPayrollEur: number
  /**
   * Per-earner wage gross and social lines when modelling married households
   * with {@link PapOptions.partnerRe4}; omitted for single filers or lump-sum married.
   */
  marriedEarners?: readonly [MarriedEarnerSlice, MarriedEarnerSlice]
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

// UPTAB21 from Lohnsteuer2021.xml (Stand 2020-11-03).
function uptab21(zve: number, kztab = 1): number {
  const X = Math.floor(zve / kztab)
  let st = 0
  const GFB = GFB_2021
  if (X < GFB + 1) {
    st = 0
  } else if (X < 14754) {
    const Y = Math.trunc(((X - GFB) / 10000) * 1_000_000) / 1_000_000
    const RW = Y * 995.21 + 1400
    st = Math.floor(RW * Y)
  } else if (X < 57919) {
    const Y = Math.trunc(((X - 14753) / 10000) * 1_000_000) / 1_000_000
    const RW = Y * 208.85 + 2397
    st = Math.floor(Y * RW + 950.96)
  } else if (X < 274613) {
    st = Math.floor(X * 0.42 - 9136.63)
  } else {
    st = Math.floor(X * 0.45 - 17374.99)
  }
  return st * kztab
}

export function tariffOnZVe(zve: number, kztab: number, year: number): number {
  if (year === 2021) return uptab21(zve, kztab)
  if (year === 2026) return uptab26(zve, kztab)
  return uptab25(zve, kztab)
}

/** ⌊ZVE / KZTAB⌋ from which marginal **45 %** replaces linear **42 %** extrapolation inside UPTAB (year‑specific knot). */
export function reichenTariffXThresholdForYear(year: number): number {
  return year === 2021 ? 274_613 : 277_826
}

/** 2026 knot (EUR); see {@link reichenTariffXThresholdForYear}. */
export const REICHEN_TARIFF_X_THRESHOLD = reichenTariffXThresholdForYear(2026)

/**
 * Minimum **Zu versteuerndes Einkommen** whose tariff quotient **⌊ZVE / KZTAB⌋** enters the upper block at
 * the {@link reichenTariffXThresholdForYear}-given knot.
 *
 * - **kztab = 1** → tariff threshold equals the table knot (EUR **274 613** or **277 826** …).
 * - **kztab = 2** → EUR **≈ 2 × knot** on **joint** ZVE (`KZTAB = 2`).
 */
export function minZVeFloorForTariffTopBracket(kztab: number, year: number = DEFAULTS.year): number {
  return reichenTariffXThresholdForYear(year) * Math.max(1, kztab)
}

/**
 * **KZTAB** used inside `calculatePapResultFromRE4`. When `partnerRe4` triggers the married two‑worker path externally,
 * use **`TARIFF_KZTAB_DUAL_EARNER_HOUSEHOLD`** instead (always 2).
 */
export function tariffKztabRe4SweepPath(opts: PapOptions): 1 | 2 {
  const o = { ...DEFAULTS, ...opts }
  return o.filing === 'married' || o.stkl === 3 ? 2 : 1
}

/** Household total (`calculatePapForMarriedHouseholdTotal`): joint ZVE is always taxed with **KZTAB = 2**. */
export const TARIFF_KZTAB_DUAL_EARNER_HOUSEHOLD = 2 as const

/**
 * Extra UPTAB income tax (EUR) from the 45% top bracket vs extrapolating the linear 42% middle-bracket formula —
 * the usual “Reichensteuer” / Spitzensteuersatz pedagogical slice. Zero below **`reichenTariffXThresholdForYear(year)`**
 * on **X = ⌊ZVE/kztab⌋**.
 *
 * Inputs come from **this scenario’s curve** ({@link PapCalculationResult.zve}, {@link PapCalculationResult.kztab}, year knobs).
 *
 * Not “on top of” ZVE: ZVE **is only the tax base**; this amount **sits inside** tariff output **`base`**, partitioning it for charts.
 *
 * Applicable for **modeled tariff years only** ({@link tariffOnZVe}); **`0`** if not implemented.
 */
export function reichenTariffSurchargeEur(zve: number, kztab: number, year: number): number {
  const thresh = reichenTariffXThresholdForYear(year)
  const z = Math.max(0, zve)
  const kt = Math.max(1, kztab)
  const X = Math.floor(z / kt)
  if (X < thresh) return 0
  if (year !== 2021 && year !== 2025 && year !== 2026) return 0
  const actual = tariffOnZVe(z, kt, year)
  const hypo =
    year === 2021
      ? Math.floor(X * 0.42 - 9136.63) * kt
      : year === 2026
        ? Math.floor(X * 0.42 - 11135.63) * kt
        : Math.floor(X * 0.42 - 10911.92) * kt
  return Math.max(0, actual - hypo)
}

function reichenPayrollDeltaEur(
  base: number,
  payrollTax: number,
  reichenTariffEur: number,
  solidarity: boolean,
  churchRate: number,
  year: number,
  kztab: number,
): number {
  if (reichenTariffEur <= 0) return 0
  const hypoBase = Math.max(0, base - reichenTariffEur)
  const hypoSolz = computeWageSoli(hypoBase, solidarity, year, kztab)
  const hypoChurch = Math.round(hypoBase * (churchRate || 0))
  const hypoPayroll = hypoBase + hypoSolz + hypoChurch
  return Math.max(0, payrollTax - hypoPayroll)
}

export function calculatePapTax(income: number, opts?: PapOptions): number {
  const o = { ...DEFAULTS, ...(opts || {}) }
  const incomeNonNeg = Math.max(0, income)

  const kfbTot = kfbEuroPerKind(o) * (o.children || 0)
  const taxable = Math.max(0, incomeNonNeg - kfbTot)

  // Splitting (married) handled by computing tax on half the income and doubling
  if (o.filing === 'married') {
    const half = taxable / 2
    return Math.round(2 * calculatePapTax(half, { ...o, filing: 'single', children: 0 }))
  }

  if (o.year === 2025 || o.year === 2026 || o.year === 2021) {
    const kztab = o.stkl === 3 ? 2 : 1
    const base = tariffOnZVe(taxable, kztab, o.year)
    const solz = computeWageSoli(base, o.solidarity, o.year, kztab)
    const church = Math.round(base * (o.churchRate || 0))
    const payrollTax = base + solz + church
    const saverAllowance = 1000
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
  const saverAllowance = 1000
  const investmentTaxable = Math.max(0, (o.investmentIncome || 0) - saverAllowance)
  const investmentTax = Math.round(investmentTaxable * 0.25)
  const investmentSolz = o.solidarity ? Math.round(investmentTax * 0.055) : 0
  const investmentChurch = Math.round(investmentTax * (o.churchRate || 0))
  return payrollTax + investmentTax + investmentSolz + investmentChurch
}

// --- Start PAP flow helpers (simplified MZTABFB + UPEVP + MLSTJAHR) ---

function computeFixedAllowances(re4: number, opts?: PapOptions) {
  const o = { ...DEFAULTS, ...(opts || {}) }
  const kfb = kfbEuroPerKind(o) * (o.children || 0)
  const efa = tableEfaEuro(o.stkl, o.year)
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
  // Only 2021/2025/2026 implement the split RV / KV+PV / AV lines used by charts.
  if (o.year !== 2025 && o.year !== 2026 && o.year !== 2021) {
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
  const defaultRv =
    o.year === 2026 ? BBGRVALV_2026 : o.year === 2025 ? BBGRVALV_2025 : BBGRVALV_2021
  const defaultKv =
    o.year === 2026 ? BBGKVPV_2026 : o.year === 2025 ? BBGKVPV_2025 : BBGKVPV_2021
  const bbgRvAlv = opts?.bbgRvAlv ?? defaultRv
  const bbgKvPv = opts?.bbgKvPv ?? defaultKv
  const zre4vprRv = Math.min(zre4vp, bbgRvAlv)
  let vspRenten = 0
  if (o.krv !== 1) {
    if (o.year === 2021) {
      const t = Math.floor(zre4vprRv * TBSVORV_2021 * 100) / 100
      vspRenten = Math.floor(t * RVSATZAN_2026 * 100) / 100
    } else {
      vspRenten = Math.floor(zre4vprRv * RVSATZAN_2026 * 100) / 100
    }
  }

  const zre4vprKvPv = Math.min(zre4vp, bbgKvPv)
  let pvsatzan =
    o.year === 2021 ? (o.pvs === 1 ? PVSATZAN_AN_2021_SAX : PVSATZAN_AN_2021_REG) : PVSATZAN_2026
  const pvzBump = o.year === 2021 ? 0.0025 : 0.006
  pvsatzan = o.pvz === 1 ? pvsatzan + pvzBump : pvsatzan - o.pva * 0.0025
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

  // PAP 2025/2021 UPEVP: compare ceil(VSP3+VSP1) with ceil(VSP1+min(12%·ZRE4RV, VHB)).
  const papLegacyUpevpPathForGkv = (o.year === 2025 || o.year === 2021) && o.pkv === 0

  if (papLegacyUpevpPathForGkv) {
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

/**
 * Scale a married household to `householdGross` while keeping the same **share**
 * of gross between earners as `referenceIncome1` : `referenceIncome2` (used for x-axis sweeps).
 */
export function calculatePapForMarriedHouseholdTotal(
  householdGross: number,
  referenceIncome1: number,
  referenceIncome2: number,
  opts?: PapOptions,
): PapCalculationResult {
  const g = Math.max(0, Math.round(householdGross))
  const s = Math.max(0, referenceIncome1) + Math.max(0, referenceIncome2)
  const ratio = s > 0 ? Math.max(0, referenceIncome1) / s : 0.5
  const re4a = Math.round(g * ratio)
  const re4b = Math.max(0, g - re4a)
  return calculateMarriedHouseholdFromIncomes(re4a, re4b, opts)
}

function gfbForTariffYear(year: number): number {
  if (year === 2026) return GFB_2026
  if (year === 2021) return GFB_2021
  return GFB_2025
}

function calculateMarriedHouseholdFromIncomes(re4a: number, re4b: number, opts?: PapOptions): PapCalculationResult {
  const o = { ...DEFAULTS, ...(opts || {}) }
  const kfb = kfbEuroPerKind(o) * (o.children || 0)
  const efa = tableEfaEuro(o.stkl, o.year)
  const anpA = o.stkl && o.stkl < 6 && re4a > 0 ? Math.min(Math.ceil(re4a), 1230) : 0
  const anpB = o.stkl && o.stkl < 6 && re4b > 0 ? Math.min(Math.ceil(re4b), 1230) : 0
  const sap = 36
  const ztabfb = Math.floor(efa + anpA + anpB + sap + kfb)
  const anp = anpA + anpB

  const d1 = computeVorsorgeDetails(re4a, opts)
  const d2 = computeVorsorgeDetails(re4b, opts)
  const vspTotal = d1.vsp + d2.vsp
  const totalRe4 = re4a + re4b
  const zve = Math.max(0, Math.floor(totalRe4 - ztabfb - d1.vsp - d2.vsp))

  const kztab = 2
  const gfb = gfbForTariffYear(o.year)
  const base = tariffOnZVe(zve, kztab, o.year)

  const wageSolz = computeWageSoli(base, o.solidarity, o.year, kztab)
  const wageChurch = Math.round(base * (o.churchRate || 0))
  const payrollTax = base + wageSolz + wageChurch
  const reichenTariffEur = reichenTariffSurchargeEur(zve, kztab, o.year)
  const reichenPayrollEur = reichenPayrollDeltaEur(
    base,
    payrollTax,
    reichenTariffEur,
    o.solidarity,
    o.churchRate || 0,
    o.year,
    kztab,
  )

  const investmentIncome = Math.max(0, o.investmentIncome || 0)
  const saverAllowance = 2000
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

  const marriedEarners: [MarriedEarnerSlice, MarriedEarnerSlice] = [
    {
      income: re4a,
      vspRenten: d1.vspRenten,
      vspKrankenPflege: d1.vspKrankenPflege,
      vspArbeitslosen: d1.vspArbeitslosen,
    },
    {
      income: re4b,
      vspRenten: d2.vspRenten,
      vspKrankenPflege: d2.vspKrankenPflege,
      vspArbeitslosen: d2.vspArbeitslosen,
    },
  ]

  return {
    income: totalRe4,
    investmentIncome,
    totalIncome: totalRe4 + investmentIncome,
    stkl: o.stkl,
    year: o.year,
    kztab,
    gfb,
    anp,
    efa,
    sap,
    kfb,
    ztabfb,
    vsp: vspTotal,
    zre4vp: d1.zre4vp + d2.zre4vp,
    vspRenten: d1.vspRenten + d2.vspRenten,
    vspKrankenPflege: d1.vspKrankenPflege + d2.vspKrankenPflege,
    vspArbeitslosen: d1.vspArbeitslosen + d2.vspArbeitslosen,
    vsphb: d1.vsphb + d2.vsphb,
    vspn: d1.vspn + d2.vspn,
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
    reichenTariffEur,
    reichenPayrollEur,
    marriedEarners,
  }
}

export function calculatePapResultFromRE4(re4: number, opts?: PapOptions): PapCalculationResult {
  const o = { ...DEFAULTS, ...(opts || {}) }
  if (o.filing === 'married' && typeof o.partnerRe4 === 'number') {
    return calculateMarriedHouseholdFromIncomes(Math.max(0, re4), Math.max(0, o.partnerRe4), opts)
  }
  const { anp, efa, sap, kfb, ztabfb } = computeFixedAllowances(re4, o)
  const vspDetails = computeVorsorgeDetails(re4, o)
  const vsp = vspDetails.vsp
  const zve = Math.max(0, Math.floor(re4 - ztabfb - vsp))

  const kztab = o.filing === 'married' || o.stkl === 3 ? 2 : 1
  const gfb = gfbForTariffYear(o.year)
  const base = tariffOnZVe(zve, kztab, o.year)

  const wageSolz = computeWageSoli(base, o.solidarity, o.year, kztab)
  const wageChurch = Math.round(base * (o.churchRate || 0))
  const payrollTax = base + wageSolz + wageChurch
  const reichenTariffEur = reichenTariffSurchargeEur(zve, kztab, o.year)
  const reichenPayrollEur = reichenPayrollDeltaEur(
    base,
    payrollTax,
    reichenTariffEur,
    o.solidarity,
    o.churchRate || 0,
    o.year,
    kztab,
  )

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
    reichenTariffEur,
    reichenPayrollEur,
  }
}

const REICHEN_SALARY_SEARCH_CEILING_EUR = 10_000_000

/** Round gross “tail” upwards so the plotted domain shows a readable margin beyond the first Reichen point. */
export function paddedChartMaxForReichenZone(minGrossEUR: number, roundingStep = 5000): number {
  return Math.ceil((Math.max(0, minGrossEUR) * 1.02) / roundingStep) * roundingStep
}

/**
 * Smallest sampled gross/household RE4 along the explorer’s curve path where {@link PapCalculationResult.reichenTariffEur}
 * turns positive. Uses the same modelling as charts: **`filing !== 'married'`** → sweep `calculatePapResultFromRE4`; **married**
 * two-earner path → sweep `calculatePapForMarriedHouseholdTotal` with the supplied reference split.
 *
 * Statutory tariff knot **⌊ZVE / KZTAB⌋ ≥ `reichenTariffXThresholdForYear(year)`** is easiest to state for **kztab = 1**
 * (typical Grundtarif / single splitting); **`kztab = 2`** moves the surcharge to a substantially higher household ZVE —
 * this function reflects that automatically.
 *
 * Returns `null` before the surcharge appears below {@link REICHEN_SALARY_SEARCH_CEILING_EUR} or outside **2021/2025/2026** tariff years.
 */
export function findMinGrossPositiveReichen(
  opts: PapOptions,
  marriedReference?: { income1: number; income2: number },
): number | null {
  const o = { ...DEFAULTS, ...opts }
  if (!(o.year === 2025 || o.year === 2026 || o.year === 2021)) return null

  const marriedRefs = (): { income1: number; income2: number } => {
    if (!marriedReference) return { income1: 60_000, income2: 60_000 }
    const a = Math.max(0, marriedReference.income1)
    const b = Math.max(0, marriedReference.income2)
    return a + b > 0 ? { income1: a, income2: b } : { income1: 60_000, income2: 60_000 }
  }

  const hasPositiveAt = (guess: number): boolean => {
    const g = Math.max(0, Math.round(guess))
    if (o.filing === 'married') {
      const { income1: i1, income2: i2 } = marriedRefs()
      return calculatePapForMarriedHouseholdTotal(g, i1, i2, o).reichenTariffEur > 0
    }
    return calculatePapResultFromRE4(g, o).reichenTariffEur > 0
  }

  if (!hasPositiveAt(REICHEN_SALARY_SEARCH_CEILING_EUR)) return null

  let lo = 0
  let hi = REICHEN_SALARY_SEARCH_CEILING_EUR
  while (hi - lo > 500) {
    const mid = Math.floor((lo + hi) / 2)
    if (hasPositiveAt(mid)) hi = mid
    else lo = mid
  }
  return hi
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
  calculatePapForMarriedHouseholdTotal,
  calculatePapSeries,
}
