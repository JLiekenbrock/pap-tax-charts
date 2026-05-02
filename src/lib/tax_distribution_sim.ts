/**
 * Monte Carlo synthesizer: draws synthetic employees / couples, runs {@link calculatePapResultFromRE4}
 * (+ married `partnerRe4`), aggregates tax burdens — microsim-lite, not official redistribution accounts.
 *
 * **Wages** follow the Destatis FT **percentile spline** ({@link grossAtDeStatisPercentile}). Unless
 * `{@link TaxBurdenSimConfig.householdSampling}` is **`'destatis_net_equiv_typ1_persons_2025'`**, **Marriage /
 * dual-earner / children** priors vary by wage decile via `{@link TaxBurdenSimConfig.demographicsPerWageDecile}` or globals (`ceil` spline percentile ÷ 10 ⇒ decile **1 … 10**).
 *
 * **Official statistics worth mining for calibrated `p`’s decile‑by‑decile:**
 * - [**EU‑SILC (Mikrozensus‑Unterstichprobe)**](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Einkommen-Konsum-Lebensbedingungen/Lebensbedingungen-Armutsgefaehrdung/_inhalt.html): equivalised disposable income vs **Haushaltstyp** (single, couples w/o children, lone parents, couples w/ children…); use to reconstruct P(children | income band), P(couple | band) once you harmonise bins with your spline.
 * - [**Mikrozensus Haushalte & Familien**](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Haushalte-Familien/_inhalt.html): household size, lone parents; cross with income classes where published.
 * - [**Verdienststrukturerhebung / wage percentiles**](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Einkommen-Konsum-Lebensbedingungen/Einkommen-Einkommensteuer-Verdienst/Tabellen/verdienst-und-erwerbseinkommen.html): defines the **individual gross wage ladder** aligned with `grossAtDeStatisPercentile` — coupling to family form still comes mostly from SILC/Haushalte tables, **not** from VSE alone.
 * - **SOEP / FDZ** scientific use files: richest for joint densities P(married, kids, hh income | personal gross), if you licence microdata — still **not identical** to PAP taxable concepts.
 *
 * **Alignment caveats:** published tables pair **equivalised disposable net household income**, **employment income aggregates**, etc., with Demographic states; Your draws use **individual full‑time brute RE4 percentile** mapped to synthetic tax households — expect **scaling / joint‑distribution approximation error** whenever you splice tables manually.
 *
 * **`householdSampling: 'destatis_net_equiv_typ1_persons_2025'`** ignores `pMarried` /
 * `pChildrenAtLeastOne` / `demographicsPerWageDecile` **for structure** — it draws a **SILC‑based
 * marginal over Haushaltstyppersonen** (Destatis [*einkommen‑typ‑1*](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Einkommen-Konsum-Lebensbedingungen/Lebensbedingungen-Armutsgefaehrdung/Tabellen/einkommen-typ-1.html), Erhebung **2025** / Endergebnisse).
 * Optional **`mz2025FamilienTabelle2_1ChildStrat`** layers [**Mikrozensus Familien nach Lebensform und Kinderzahl**](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Haushalte-Familien/Tabellen/2-1-familien.html) (**2025 Erstergebnisse**): **`1 / 2 / 3+`** Kinder under official **Familien‑Gewichte**, plus an **Ehe vs Lebensgemeinschaft** surrogate among paired‑parent **`Familien`**, stored on **`TaxBurdenSimDraw`** — **`filing` = `married` stays** on all **zwei‑Erwachsene** SILC‑Zeilen (**unverheiratete Kernfamilien** sind steuerrechtlich **nicht** identisch mit **ZVeranlagung**; MZ‑Familienform ist dokumentarisch **`mzFamilienform2025Approx`**).
 * Optionally `{@link TaxBurdenSimConfig.primaryBruttoSampling}` **`'equiv_net_typ1_quartiles_to_gesamt_rank'`**: draw **`U ~ Unif(0, 1)`**, map to **Äquivalenzeinkommen €** (**piecewise‑linear tails** anchored at published **Q25 / median / Q75** `{@link destatisHaushaltstypTyp1EquivNetQuartilesEUR2025}`)
 * conditional on **`Haushaltstyp`**, then map that euro level onto a surrogate **overall population rank** using the **`Personen insgesamt`** quartiles (**same interpolation family** inverted by bisection), and turn that rank into **`grossAtDeStatisPercentile`** ordinate — heuristic **Äquivalentnetto‑quantile → FT‑Brutto‑dezil** bridging **without** claiming an official SILC × VSE joint density.
 */

import type { PapCalculationResult, PapOptions } from './pap'
import { calculatePapResultFromRE4 } from './pap'
import { deriveStkl } from './stkl'
import { actualContributions } from './rates'
import { grossAtDeStatisPercentile } from './privilege_benchmark'

const SPLINE_PERCENTILE_EPS = 0.008

/** Deterministic RNG in [0, 1); same seed ⇒ same stream. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0 || 123456789
  return () => {
    state += 0x6d2b79f5
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), state | 61)
    const u = Math.imul(t ^ (t >>> 14), t | 1)
    return (u >>> 0) / 4294967296
  }
}

export type TaxBurdenDemoSlice = {
  pMarried: number
  pDualEarnerWhenMarried: number
  spouseRankCorrelation: number
  pChildrenAtLeastOne: number
  meanChildrenBeyondFirst: number
}

/** Rows of “Verteilung des Nettoäquivalenzeinkommens nach Haushaltstyp” — person‑level weights (**1 000 Persons** counts). */
export type DestatisNetEquivHaushaltstypTyp1Key =
  | 'alleinlebende'
  | 'zwei_erwachsene_ohne_kind'
  | 'drei_oder_mehr_erwachsene_ohne_kind'
  | 'alleinerziehende'
  | 'zwei_erwachsene_mit_kindern'
  | 'sonstige_haushalte_mit_kindern'

/**
 * SILC MZ: **Personen‑Gewichte** nach Haushaltstyp, Erhebung 2025 (Destatis Tab. *einkommen‑typ‑1*,
 * `Personen insgesamt` Spalte, **April 2026** Stand). Inner categories sum within rounding to **`82 739`**;
 * Monte Carlo sampling normalises `{@link destatisHaushaltstypTyp1Counts2025.personsThousands}` internally.
 *
 * **`drei+` / sonstige** are modeled as **`married` filing** households like **two‑adult‑type**
 * cores (tax unit ambiguity in SILC; see source footnotes).
 */
export const destatisHaushaltstypTyp1Counts2025 = {
  refSurveyYearShownAs: 2025,
  publicationNote: 'Endergebnisse seit 2020; Kinder bis 24 bei ökonomischer Abhängigkeit (Tabellenfußnote).',
  sourceUrl:
    'https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Einkommen-Konsum-Lebensbedingungen/Lebensbedingungen-Armutsgefaehrdung/Tabellen/einkommen-typ-1.html',
  personsTotalThousandsListed: 82_739,
  personsThousands: {
    alleinlebende: 17_318,
    zwei_erwachsene_ohne_kind: 24_948,
    drei_oder_mehr_erwachsene_ohne_kind: 5_536,
    alleinerziehende: 4_351,
    zwei_erwachsene_mit_kindern: 26_515,
    sonstige_haushalte_mit_kindern: 4_069,
  } satisfies Record<DestatisNetEquivHaushaltstypTyp1Key, number>,
} as const

/** Published **Äquivalenzeinkommen** quartile thresholds (**€ / year**), SILC MZ tab. *einkommen‑typ‑1* (**April 2026** Stand). */
export type DestatisEquivNetQuartilesEUR = Readonly<{ q25: number; q50: number; q75: number }>

/** Same publication as `{@link destatisHaushaltstypTyp1Counts2025}` — complements person counts with **`1. / 2. / 3.` Quartils‑€** columns (`Personen insgesamt`) per row key. */
export const destatisHaushaltstypTyp1EquivNetQuartilesEUR2025 = {
  gemeinsamt: { q25: 20_553, q50: 28_891, q75: 40_176 } satisfies DestatisEquivNetQuartilesEUR,
  nachHaushaltstyp: {
    alleinlebende: { q25: 15_600, q50: 23_400, q75: 33_000 },
    zwei_erwachsene_ohne_kind: { q25: 22_483, q50: 31_647, q75: 44_119 },
    drei_oder_mehr_erwachsene_ohne_kind: { q25: 26_325, q50: 34_599, q75: 44_170 },
    alleinerziehende: { q25: 16_485, q50: 21_745, q75: 28_720 },
    zwei_erwachsene_mit_kindern: { q25: 22_165, q50: 30_410, q75: 41_632 },
    sonstige_haushalte_mit_kindern: { q25: 22_431, q50: 28_800, q75: 38_267 },
  } satisfies Record<DestatisNetEquivHaushaltstypTyp1Key, DestatisEquivNetQuartilesEUR>,
} as const

/** Mikrozensus **Familienform** surrogate from Tab. 2 – 1 (not identical to **`filing`** / **ZVeranlagung**). */
export type MzFamilienform2025Erstergeb = 'ehepaar' | 'lebensgemeinschaft' | 'alleinerziehend'

/**
 * Hauptwohnsitz‑**Familien** nach Lebensform und Kindertabelle (**`1 Kind` / `2 Kinder` / `3 Kinder und mehr`**), **`1 000 Familien`** — Mikrozensus **Erstergebnisse 2025** (Stand April 2026).
 * [Tab. 2 – 1 Familien](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Haushalte-Familien/Tabellen/2-1-familien.html)
 */
export const destatisMikrozensusFamilien2_12025NachLebensformUndKinderzahl = {
  refYearFamilienMZ: 2025,
  resultKindMZ: 'erstergebnis' as const,
  publicationStandNote:
    'Familien nach MZ‑Definition; Kinder ohne Altersgrenze in dieser Tabelle.',
  sourceUrl:
    'https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Haushalte-Familien/Tabellen/2-1-familien.html',
  alleinerziehendeFamiliesThousands: {
    EinKind: 1_904,
    ZweiKinder: 743,
    DreiUndMehrKinder: 222,
    listeInsgesamtAlleinerziehende: 2_870,
  },
  elternpaareMitKindThousands: {
    einKindEhepaar: 3_355,
    einKindLebensgemeinschaft: 643,
    zweiKinderEhepaar: 3_255,
    zweiKinderLebensgemeinschaft: 368,
    dreiPlusEhepaar: 1_233,
    dreiPlusLebensgemeinschaft: 108,
  },
} as const

export type TaxBurdenPrimaryBruttoSampling =
  /**
   * **Default:** primary FT‑Brutto **uncorrelated** with SILC Äquivalent table — percentile **Uniform** on spline.
   */
  | 'marginal_uniform_brutto_spline'
  /**
   * **Typ‑conditional**: draw **`U ~ Unif(0, 1)`**, map to Äquivalent **€** with `{@link hqEquivDisposableNetFromPopulationRankTriple}`,
   * invert to **overall** rank surrogate using **`gemeinsamt`** quartiles (**bisection**), then evaluate `{@link grossAtDeStatisPercentile}`
   * at spline rank proportional to that surrogate (**`ceil(p / 10)`** brute decile approximation).
   */
  | 'equiv_net_typ1_quartiles_to_gesamt_rank'

export type TaxBurdenSimHouseholdSampling =
  | 'wage_decile_demographics'
  /** SILC MZ marginal over **`Haushaltstyp`** person weights (**optionally coupled** `{@link TaxBurdenPrimaryBruttoSampling}` to published quartile € thresholds). */
  | 'destatis_net_equiv_typ1_persons_2025'

export type TaxBurdenSimConfig = Readonly<{
  householdSampling?: TaxBurdenSimHouseholdSampling
  /**
   * **Only consulted** together with **`householdSampling: 'destatis_net_equiv_typ1_persons_2025'`** — ignored otherwise.
   */
  primaryBruttoSampling?: TaxBurdenPrimaryBruttoSampling
  /**
   * Layers [**Mikrozensus Tab. 2 – 1 Familien 2025 (Erstergebnisse)**](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Haushalte-Familien/Tabellen/2-1-familien.html) on SILC `Haushaltstyp`:
   * Kinderzahl {1, 2, ≥3 gekappt `maxChildrenSim`}; among **zwei‑Erw‑mit‑Kind** pooled **Ehe+LBG**, extra draw **Ehe vs LG** ⇒ **`mzFamilienform2025Approx`** (**`filing`** bleibt `married`).
   *
   * **`true`** only together with **`householdSampling: 'destatis_net_equiv_typ1_persons_2025'`** — elsewhere ignored.
   */
  mz2025FamilienTabelle2_1ChildStrat?: boolean
  sampleSize: number
  rngSeed: number
  year: 2025 | 2026
  /**
   * Global defaults merged with `{@link demographicsPerWageDecile}` row for draw’s wage decile
   * (**decile d ≈ ** `ceil(primarySplinePercent / 10)` **capped 1 … 10**).
   */
  pMarried: number
  pDualEarnerWhenMarried: number
  spouseRankCorrelation: number
  pChildrenAtLeastOne: number
  meanChildrenBeyondFirst: number
  maxChildrenSim: number
  /**
   * **10 optional rows** keyed by decile 1 … 10; row k overrides globals for draws whose sampled primary percentile
   * falls into decile k. Leave rows `undefined`/sparse — missing fields reuse globals.
   */
  demographicsPerWageDecile?: ReadonlyArray<Partial<TaxBurdenDemoSlice>>
  /**
   * On the wage‑spline path only (anything **except**
   * `{@link householdSampling}: 'destatis_net_equiv_typ1_persons_2025'`): fix **Veranlagungsform /
   * Kinderzahl** instead of sampling from `{@link pMarried}` / `{@link sampleChildren}`.
   * Dual‑earner draw when `filing === 'married'` follows `{@link marriedDualEarner}` if set,
   * otherwise the usual RNG from merged decile `{@link pDualEarnerWhenMarried}`.
   *
   * **Ignored on SILC Haushaltstyp‑1 sampling**, where structure comes from SILC+MZ overlays.
   */
  fixedHouseholdSketch?: Readonly<{
    filing: 'single' | 'married'
    children: number
    marriedDualEarner?: boolean
  }>
  basePap: Omit<PapOptions, 'filing' | 'children' | 'stkl' | 'partnerRe4'>
}>

/** One synthetic unit after PAP evaluation. */
export type TaxBurdenSimDraw = {
  /**
   * Set when **`householdSampling === 'destatis_net_equiv_typ1_persons_2025'`** — which SILC‑bucket
   * determined filing / children priors.
   */
  haushaltstyp?: DestatisNetEquivHaushaltstypTyp1Key
  /**
   * **Mikrozensus Tab. 2 – 1** surrogate when **`mz2025FamilienTabelle2_1ChildStrat`**; Paare **ohne** Kind ⇒ `undefined`.
   * **≠** garantiert **`filing`** (**Lebensgemeinschaft** ohne Ehe / LP ≠ **gemeinsame Veranlagung**).
   */
  mzFamilienform2025Approx?: MzFamilienform2025Erstergeb
  wageDecile: number
  primaryWagePercentile: number
  filing: 'single' | 'married'
  children: number
  stkl: number
  /** Primary modeled RE4 (married: configured as dominant earner / `income1`). */
  income1: number
  income2: number
  totalGrossAnnual: number
  totalBurdenPct: number
  payrollTaxPctOnSalary: number
}

export type TaxBurdenHistogram = {
  binWidthPctPoints: number
  bins: ReadonlyArray<{ lo: number; hi: number; count: number; share: number }>
}

export type TaxBurdenSimSummary = {
  n: number
  meanBurdenPct: number
  stdevBurdenPct: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export type TaxBurdenSimResult = {
  draws: ReadonlyArray<TaxBurdenSimDraw>
  summary: TaxBurdenSimSummary
  histogram: TaxBurdenHistogram
}

/** Heuristic global demographics when no per‑decile table is supplied yet. */
export const DEMOGRAPHIC_SIM_PRESETS_DEFAULT: Omit<
  TaxBurdenSimConfig,
  'sampleSize' | 'rngSeed' | 'year' | 'basePap'
> = {
  pMarried: 0.46,
  pDualEarnerWhenMarried: 0.64,
  spouseRankCorrelation: 0.35,
  pChildrenAtLeastOne: 0.34,
  meanChildrenBeyondFirst: 0.45,
  maxChildrenSim: 4,
}

/** Explorer‑like neutral GKV assumptions. */
export function defaultTaxSimBasePap(year: 2025 | 2026): TaxBurdenSimConfig['basePap'] {
  return {
    year,
    solidarity: true,
    churchRate: 0,
    kvz: 0,
    pvs: 0,
    pvz: 1,
    pva: 0,
    krv: 0,
    alv: 0,
    pkv: 0,
    pkpv: 0,
    pkpvagz: 0,
    investmentIncome: 0,
  }
}

/** Map spline percentile ∈ (0, 100) to wage deciles **1 … 10** (`ceil(p/10)` style). */
export function wageDecileFromPrimarySplinePercent(pctOnSpline: number): number {
  return Math.min(10, Math.max(1, Math.ceil(pctOnSpline / 10 - 1e-12)))
}

/** Globals + optional `{@link TaxBurdenSimConfig.demographicsPerWageDecile}` overrides for one decile. */
export function mergeDemographicsForDecile(
  cfg: TaxBurdenSimConfig,
  decile1to10: number,
): TaxBurdenDemoSlice {
  const base: TaxBurdenDemoSlice = {
    pMarried: cfg.pMarried,
    pDualEarnerWhenMarried: cfg.pDualEarnerWhenMarried,
    spouseRankCorrelation: cfg.spouseRankCorrelation,
    pChildrenAtLeastOne: cfg.pChildrenAtLeastOne,
    meanChildrenBeyondFirst: cfg.meanChildrenBeyondFirst,
  }
  const row = cfg.demographicsPerWageDecile?.[decile1to10 - 1]
  return row ? { ...base, ...row } : base
}

function samplePrimarySplinePercentAndGrossEUR(rng: () => number): {
  pct: number
  grossRounded: number
  decile: number
} {
  const pct = SPLINE_PERCENTILE_EPS + rng() * (99 - 2 * SPLINE_PERCENTILE_EPS)
  const grossRounded = Math.max(1, Math.round(grossAtDeStatisPercentile(pct)))
  return { pct, grossRounded, decile: wageDecileFromPrimarySplinePercent(pct) }
}

const HQ_RANK_CLIP = 1e-13
/** Heuristic floor on synthetic Äquivalent **€** tails (SILC outliers still exist above this numerically smooth floor). */
const HQ_EQUIV_EUR_HARD_FLOOR = 4_608

/**
 * Interpret `{@link DestatisEquivNetQuartilesEUR}` quartile columns as spline knots spanning three **25 %** probability slabs
 * (linear **€** extrapolation tails below **p25** and above **p75**).
 */
export function hqEquivDisposableNetFromPopulationRankTriple(
  quartiles: DestatisEquivNetQuartilesEUR,
  fractionalPopulationRankRaw: number,
): number {
  let uRaw = fractionalPopulationRankRaw
  if (!(uRaw >= 0 && uRaw <= 1))
    throw new RangeError(
      `fractionalPopulationRankRaw must satisfy 0 ≤ u ≤ 1 (received ${fractionalPopulationRankRaw})`,
    )

  let u = Math.min(1 - HQ_RANK_CLIP, Math.max(HQ_RANK_CLIP, uRaw))
  const q25 = quartiles.q25
  const q50 = Math.max(quartiles.q50, q25 + 120)
  const q75 = Math.max(quartiles.q75, q50 + 120)

  let eu: number
  if (u <= 0.5) eu = q25 + ((u - 0.25) / 0.25) * (q50 - q25)
  else if (u <= 0.75) eu = q50 + ((u - 0.5) / 0.25) * (q75 - q50)
  else eu = q75 + ((u - 0.75) / 0.25) * (q75 - q50)

  return Math.max(HQ_EQUIV_EUR_HARD_FLOOR, eu)
}

/** Approximate **inverse** of **`hqEquivDisposableNetFromPopulationRankTriple`** for **`reference`** thresholds — bisection **`u ∈ (0, 1)`**. */
export function approximatePopulationFractionFromEquivDisposableNet(
  gemeinsamt: DestatisEquivNetQuartilesEUR,
  equivalisedDisposableEURRaw: number,
): number {
  const yEu = equivalisedDisposableEURRaw
  const euMinPre = hqEquivDisposableNetFromPopulationRankTriple(gemeinsamt, HQ_RANK_CLIP)
  const euMaxPre = hqEquivDisposableNetFromPopulationRankTriple(gemeinsamt, 1 - HQ_RANK_CLIP)
  const y = Math.min(euMaxPre, Math.max(euMinPre, yEu))

  let lo = HQ_RANK_CLIP
  let hi = 1 - HQ_RANK_CLIP
  for (let k = 0; k < 56; k++) {
    const mid = 0.5 * (lo + hi)
    const yMid = hqEquivDisposableNetFromPopulationRankTriple(gemeinsamt, mid)
    if (yMid < y) lo = mid
    else hi = mid
  }
  return Math.min(1 - HQ_RANK_CLIP, Math.max(HQ_RANK_CLIP, 0.5 * (lo + hi)))
}

/** Primary wage percentile & € from **SILC Äquivalent** quartiles (typ row) ⇒ **overall** surrogate rank ⇒ VSE brute spline (`ceil` **dezil** downstream). */
function samplePrimaryFromEquivBridgedTyp1Haushaltstyp(
  gemeinsamtTriple: DestatisEquivNetQuartilesEUR,
  haushaltstypTriple: DestatisEquivNetQuartilesEUR,
  rng: () => number,
): { pct: number; grossRounded: number; decile: number } {
  const fractionalTyp = HQ_RANK_CLIP + rng() * (1 - 2 * HQ_RANK_CLIP)

  let euTyp = hqEquivDisposableNetFromPopulationRankTriple(haushaltstypTriple, fractionalTyp)
  euTyp = Math.max(HQ_EQUIV_EUR_HARD_FLOOR, euTyp)

  const fractionalGesamt = approximatePopulationFractionFromEquivDisposableNet(gemeinsamtTriple, euTyp)
  const pct =
    SPLINE_PERCENTILE_EPS + fractionalGesamt * (99 - 2 * SPLINE_PERCENTILE_EPS)

  const grossRounded = Math.max(1, Math.round(grossAtDeStatisPercentile(pct)))
  return { pct, grossRounded, decile: wageDecileFromPrimarySplinePercent(pct) }
}

function resolvedPrimaryBruttoSampling(cfg: TaxBurdenSimConfig): TaxBurdenPrimaryBruttoSampling {
  return cfg.primaryBruttoSampling ?? 'marginal_uniform_brutto_spline'
}

function wagePercentileFrac(rng: () => number): number {
  const epsilon = 1e-4
  return epsilon + rng() * (1 - 2 * epsilon)
}

function sampleChildren(slice: TaxBurdenDemoSlice, maxChildrenSim: number, rng: () => number): number {
  if (rng() >= slice.pChildrenAtLeastOne) return 0
  let c = 1
  while (c < maxChildrenSim) {
    const pExtra = slice.meanChildrenBeyondFirst / (1 + slice.meanChildrenBeyondFirst)
    if (rng() < pExtra) c++
    else break
  }
  return Math.min(maxChildrenSim, c)
}

/** Same thinning process as `{@link sampleChildren}` starting from one child (“Tabellen‑Haushalt mit Kind”). */
function sampleChildrenForcedAtLeastOne(
  meanChildrenBeyondFirst: number,
  maxChildrenSim: number,
  rng: () => number,
): number {
  let c = 1
  while (c < maxChildrenSim) {
    const pExtra = meanChildrenBeyondFirst / (1 + meanChildrenBeyondFirst)
    if (rng() < pExtra) c++
    else break
  }
  return Math.min(maxChildrenSim, c)
}

function resolvedMz2025FamStrat(cfg: TaxBurdenSimConfig): boolean {
  return !!(
    cfg.householdSampling === 'destatis_net_equiv_typ1_persons_2025' &&
    cfg.mz2025FamilienTabelle2_1ChildStrat
  )
}

type MikrozensusCoupleFamilieMitKindBucket = 'ein_kind' | 'zwei_kinder' | 'drei_und_mehr_kinder'

function sampleIntegerUniformInclusive(loInclusive: number, hiInclusive: number, rng: () => number): number {
  const span = hiInclusive - loInclusive + 1
  return loInclusive + Math.floor(rng() * span)
}

/** Inverse‑CDF over three MZ **Familien‑Zellen** (`1 / 2 / ≥3 Kinder`, **Tab. 2 – 1** Alleinerziehende‑Spalte). */
export function sampleMikrozensus2025FamilienKinderzahlAlleinerziehende(
  maxChildrenSim: number,
  rng: () => number,
): number {
  const a = destatisMikrozensusFamilien2_12025NachLebensformUndKinderzahl.alleinerziehendeFamiliesThousands
  const w = [a.EinKind, a.ZweiKinder, a.DreiUndMehrKinder] as const
  const denom = w[0]! + w[1]! + w[2]!
  let u = rng() * denom
  if (u < w[0]!) return Math.min(1, maxChildrenSim)
  u -= w[0]!
  if (u < w[1]!) return Math.min(2, maxChildrenSim)
  if (maxChildrenSim < 3) return Math.max(1, maxChildrenSim)
  return sampleIntegerUniformInclusive(3, maxChildrenSim, rng)
}

export function sampleMikrozensus2025FamilienPaarMitKindKinderzahlUndMZLebensform(
  maxChildrenSim: number,
  rng: () => number,
): {
  children: number
  mzFamilienform: 'ehepaar' | 'lebensgemeinschaft'
  bucket: MikrozensusCoupleFamilieMitKindBucket
} {
  const t =
    destatisMikrozensusFamilien2_12025NachLebensformUndKinderzahl.elternpaareMitKindThousands
  const w1 = t.einKindEhepaar + t.einKindLebensgemeinschaft
  const w2 = t.zweiKinderEhepaar + t.zweiKinderLebensgemeinschaft
  const w3p = t.dreiPlusEhepaar + t.dreiPlusLebensgemeinschaft
  const denom = w1 + w2 + w3p
  let u = rng() * denom

  if (u < w1) {
    const mzFamilienform =
      rng() * w1 < t.einKindEhepaar ? 'ehepaar' : 'lebensgemeinschaft'
    return { children: Math.min(1, maxChildrenSim), mzFamilienform, bucket: 'ein_kind' }
  }
  u -= w1

  if (u < w2) {
    const mzFamilienform =
      rng() * w2 < t.zweiKinderEhepaar ? 'ehepaar' : 'lebensgemeinschaft'
    return {
      children: Math.min(2, maxChildrenSim),
      mzFamilienform,
      bucket: 'zwei_kinder',
    }
  }

  let children: number
  if (maxChildrenSim < 3) children = Math.max(1, maxChildrenSim)
  else children = sampleIntegerUniformInclusive(3, maxChildrenSim, rng)

  const mzFamilienform =
    rng() * w3p < t.dreiPlusEhepaar ? 'ehepaar' : 'lebensgemeinschaft'
  return { children, mzFamilienform, bucket: 'drei_und_mehr_kinder' }
}

const HAUSHALTSTYP_TYP1_ORDER: DestatisNetEquivHaushaltstypTyp1Key[] = [
  'alleinlebende',
  'zwei_erwachsene_ohne_kind',
  'drei_oder_mehr_erwachsene_ohne_kind',
  'alleinerziehende',
  'zwei_erwachsene_mit_kindern',
  'sonstige_haushalte_mit_kindern',
]

/** Inverse‑CDF categorical draw from Destatis `{@link destatisHaushaltstypTyp1Counts2025}` person totals. */
export function sampleHaushaltstypTyp1_2025(rng: () => number): DestatisNetEquivHaushaltstypTyp1Key {
  const pts = destatisHaushaltstypTyp1Counts2025.personsThousands
  let total = 0
  for (const k of HAUSHALTSTYP_TYP1_ORDER) total += pts[k]
  let u = rng() * total
  for (const k of HAUSHALTSTYP_TYP1_ORDER) {
    const w = pts[k]
    if (u < w) return k
    u -= w
  }
  return HAUSHALTSTYP_TYP1_ORDER[HAUSHALTSTYP_TYP1_ORDER.length - 1]!
}

export function populationShareHaushaltstypTyp12025(): Readonly<
  Record<DestatisNetEquivHaushaltstypTyp1Key, number>
> {
  const pts = destatisHaushaltstypTyp1Counts2025.personsThousands
  let total = 0
  for (const k of HAUSHALTSTYP_TYP1_ORDER) total += pts[k]
  const shares = {} as Record<DestatisNetEquivHaushaltstypTyp1Key, number>
  for (const k of HAUSHALTSTYP_TYP1_ORDER) shares[k] = pts[k] / total
  return shares
}

function marryIncomesDualEarnerIfSampled(
  primaryIncomeRounded: number,
  spouseDemo: Pick<TaxBurdenDemoSlice, 'pDualEarnerWhenMarried' | 'spouseRankCorrelation'>,
  rng: () => number,
): { income1: number; income2: number } {
  let income1 = primaryIncomeRounded
  let income2 = 0
  const dualEarner = rng() < spouseDemo.pDualEarnerWhenMarried
  if (dualEarner) {
    const uP = wagePercentileFrac(rng)
    const uS = wagePercentileFrac(rng)
    const rho = Math.min(1, Math.max(0, spouseDemo.spouseRankCorrelation))
    const mixedFrac = rho * uP + (1 - rho) * uS
    const spousePct = SPLINE_PERCENTILE_EPS + mixedFrac * (99 - 2 * SPLINE_PERCENTILE_EPS)
    income2 = Math.max(1, Math.round(grossAtDeStatisPercentile(spousePct)))
    if (income2 === income1) income2 += 1
    if (income1 < income2) {
      ;[income1, income2] = [income2, income1]
    }
  }
  return { income1, income2 }
}

function totalBurdenPct(r: PapCalculationResult): number {
  const denom = r.totalIncome
  if (!(denom > 0)) return 0
  return ((r.tax + actualContributions(r)) / denom) * 100
}

function payrollTaxPctOnSalary(r: PapCalculationResult): number {
  return r.income > 0 ? (r.payrollTax / r.income) * 100 : 0
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

function drawSingleTaxBurdenSimDestatisTyp1(cfg: TaxBurdenSimConfig, rng: () => number): TaxBurdenSimDraw {
  const haushaltstyp = sampleHaushaltstypTyp1_2025(rng)
  const gemeinsamt = destatisHaushaltstypTyp1EquivNetQuartilesEUR2025.gemeinsamt
  const hhTriple =
    destatisHaushaltstypTyp1EquivNetQuartilesEUR2025.nachHaushaltstyp[haushaltstyp]
  const bridgedPrimary =
    resolvedPrimaryBruttoSampling(cfg) === 'equiv_net_typ1_quartiles_to_gesamt_rank'
  const primary = bridgedPrimary
    ? samplePrimaryFromEquivBridgedTyp1Haushaltstyp(gemeinsamt, hhTriple, rng)
    : samplePrimarySplinePercentAndGrossEUR(rng)
  const year = cfg.year
  const spouseDemo = {
    pDualEarnerWhenMarried: cfg.pDualEarnerWhenMarried,
    spouseRankCorrelation: cfg.spouseRankCorrelation,
  }
  const mzStrat = resolvedMz2025FamStrat(cfg)

  const finishSingleChildless = (): TaxBurdenSimDraw => {
    const gross = primary.grossRounded
    const children = 0
    const stkl = deriveStkl({
      filing: 'single',
      children,
      income1: gross,
      income2: 0,
    }).stkl
    const opts: PapOptions = {
      ...cfg.basePap,
      year,
      filing: 'single',
      children,
      stkl,
    }
    const r = calculatePapResultFromRE4(gross, opts)
    return {
      haushaltstyp,
      mzFamilienform2025Approx: undefined,
      wageDecile: primary.decile,
      primaryWagePercentile: primary.pct,
      filing: 'single',
      children,
      stkl,
      income1: gross,
      income2: 0,
      totalGrossAnnual: gross,
      totalBurdenPct: totalBurdenPct(r),
      payrollTaxPctOnSalary: payrollTaxPctOnSalary(r),
    }
  }

  if (haushaltstyp === 'alleinlebende') return finishSingleChildless()

  if (haushaltstyp === 'alleinerziehende') {
    const children = mzStrat
      ? sampleMikrozensus2025FamilienKinderzahlAlleinerziehende(cfg.maxChildrenSim, rng)
      : Math.min(
          cfg.maxChildrenSim,
          sampleChildrenForcedAtLeastOne(cfg.meanChildrenBeyondFirst, cfg.maxChildrenSim, rng),
        )
    const gross = primary.grossRounded
    const stkl = deriveStkl({
      filing: 'single',
      children,
      income1: gross,
      income2: 0,
    }).stkl
    const opts: PapOptions = {
      ...cfg.basePap,
      year,
      filing: 'single',
      children,
      stkl,
    }
    const r = calculatePapResultFromRE4(gross, opts)
    return {
      haushaltstyp,
      mzFamilienform2025Approx: mzStrat ? 'alleinerziehend' : undefined,
      wageDecile: primary.decile,
      primaryWagePercentile: primary.pct,
      filing: 'single',
      children,
      stkl,
      income1: gross,
      income2: 0,
      totalGrossAnnual: gross,
      totalBurdenPct: totalBurdenPct(r),
      payrollTaxPctOnSalary: payrollTaxPctOnSalary(r),
    }
  }

  /** Married‑filing‑like rows (SILC‑mehr‑Person‑Haushalte approximated — see `{@link destatisHaushaltstypTyp1Counts2025}`). */
  const childrenMarriedHouseholdHasKids =
    haushaltstyp === 'zwei_erwachsene_mit_kindern' ||
    haushaltstyp === 'sonstige_haushalte_mit_kindern'

  let mzFamilienformApprox: TaxBurdenSimDraw['mzFamilienform2025Approx']
  mzFamilienformApprox = undefined
  let children = 0
  if (childrenMarriedHouseholdHasKids) {
    if (mzStrat) {
      const paired = sampleMikrozensus2025FamilienPaarMitKindKinderzahlUndMZLebensform(cfg.maxChildrenSim, rng)
      children = paired.children
      mzFamilienformApprox = paired.mzFamilienform
    } else {
      children = Math.min(
        cfg.maxChildrenSim,
        sampleChildrenForcedAtLeastOne(cfg.meanChildrenBeyondFirst, cfg.maxChildrenSim, rng),
      )
    }
  }

  const { income1, income2 } = marryIncomesDualEarnerIfSampled(primary.grossRounded, spouseDemo, rng)
  const stkl = deriveStkl({
    filing: 'married',
    children,
    income1,
    income2,
  }).stkl
  const opts: PapOptions = {
    ...cfg.basePap,
    year,
    filing: 'married',
    children,
    stkl,
  }
  const r = calculatePapResultFromRE4(income1, {
    ...opts,
    partnerRe4: income2,
  })
  const totalGross = r.income
  return {
    haushaltstyp,
    mzFamilienform2025Approx: mzFamilienformApprox,
    wageDecile: primary.decile,
    primaryWagePercentile: primary.pct,
    filing: 'married',
    children,
    stkl,
    income1,
    income2,
    totalGrossAnnual: totalGross,
    totalBurdenPct: totalBurdenPct(r),
    payrollTaxPctOnSalary: payrollTaxPctOnSalary(r),
  }
}

/** Run one synthetic demographic draw + full PAP. */
export function drawSingleTaxBurdenSim(cfg: TaxBurdenSimConfig, rng: () => number): TaxBurdenSimDraw {
  if (cfg.householdSampling === 'destatis_net_equiv_typ1_persons_2025') {
    return drawSingleTaxBurdenSimDestatisTyp1(cfg, rng)
  }

  const year = cfg.year
  const primary = samplePrimarySplinePercentAndGrossEUR(rng)
  const demo = mergeDemographicsForDecile(cfg, primary.decile)
  let children: number
  let married: boolean

  const fh = cfg.fixedHouseholdSketch
  if (fh) {
    married = fh.filing === 'married'
    children = Math.min(cfg.maxChildrenSim, Math.max(0, Math.floor(fh.children)))
  } else {
    children = Math.min(cfg.maxChildrenSim, sampleChildren(demo, cfg.maxChildrenSim, rng))
    married = rng() < demo.pMarried
  }

  if (!married) {
    const gross = primary.grossRounded
    const stkl = deriveStkl({
      filing: 'single',
      children,
      income1: gross,
      income2: 0,
    }).stkl
    const opts: PapOptions = {
      ...cfg.basePap,
      year,
      filing: 'single',
      children,
      stkl,
    }
    const r = calculatePapResultFromRE4(gross, opts)
    return {
      haushaltstyp: undefined,
      mzFamilienform2025Approx: undefined,
      wageDecile: primary.decile,
      primaryWagePercentile: primary.pct,
      filing: 'single',
      children,
      stkl,
      income1: gross,
      income2: 0,
      totalGrossAnnual: gross,
      totalBurdenPct: totalBurdenPct(r),
      payrollTaxPctOnSalary: payrollTaxPctOnSalary(r),
    }
  }

  const spouseDemo: TaxBurdenDemoSlice =
    fh?.filing === 'married' && fh.marriedDualEarner !== undefined
      ? {
          ...demo,
          pDualEarnerWhenMarried: fh.marriedDualEarner ? 1 : 0,
        }
      : demo

  const { income1, income2 } = marryIncomesDualEarnerIfSampled(primary.grossRounded, spouseDemo, rng)

  const stkl = deriveStkl({
    filing: 'married',
    children,
    income1,
    income2,
  }).stkl
  const opts: PapOptions = {
    ...cfg.basePap,
    year,
    filing: 'married',
    children,
    stkl,
  }
  const r = calculatePapResultFromRE4(income1, {
    ...opts,
    partnerRe4: income2,
  })
  const totalGross = r.income
  return {
    haushaltstyp: undefined,
    mzFamilienform2025Approx: undefined,
    wageDecile: primary.decile,
    primaryWagePercentile: primary.pct,
    filing: 'married',
    children,
    stkl,
    income1,
    income2,
    totalGrossAnnual: totalGross,
    totalBurdenPct: totalBurdenPct(r),
    payrollTaxPctOnSalary: payrollTaxPctOnSalary(r),
  }
}

/** Draw `sampleSize` units and summarise burden distribution. */
export function simulateTaxBurdenDistribution(cfg: TaxBurdenSimConfig): TaxBurdenSimResult {
  const rng = mulberry32(cfg.rngSeed)
  const draws: TaxBurdenSimDraw[] = []
  for (let i = 0; i < cfg.sampleSize; i++) {
    draws.push(drawSingleTaxBurdenSim(cfg, rng))
  }

  const burdens = draws.map((d) => d.totalBurdenPct).sort((a, b) => a - b)
  const mean = burdens.reduce((a, b) => a + b, 0) / Math.max(1, burdens.length)
  const variance =
    burdens.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / Math.max(1, burdens.length)
  const summary: TaxBurdenSimSummary = {
    n: burdens.length,
    meanBurdenPct: mean,
    stdevBurdenPct: Math.sqrt(variance),
    p10: quantile(burdens, 0.1),
    p25: quantile(burdens, 0.25),
    p50: quantile(burdens, 0.5),
    p75: quantile(burdens, 0.75),
    p90: quantile(burdens, 0.9),
  }

  const binWidthPctPoints = 2.5
  const rawMax = burdens.length ? burdens[burdens.length - 1]! : 100
  const histogramCeil = Math.max(100, Math.ceil(rawMax / binWidthPctPoints) * binWidthPctPoints)
  const bins: TaxBurdenHistogram['bins'] = []
  let lo = 0
  while (lo < histogramCeil) {
    const hi = Math.min(histogramCeil, lo + binWidthPctPoints)
    const count = burdens.filter((b) => b >= lo && b < hi).length
    bins.push({
      lo,
      hi,
      count,
      share: burdens.length > 0 ? count / burdens.length : 0,
    })
    lo = hi
  }

  return { draws, summary, histogram: { binWidthPctPoints, bins } }
}
