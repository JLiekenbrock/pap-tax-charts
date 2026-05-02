import { describe, expect, it } from 'vitest'
import {
  DEMOGRAPHIC_SIM_PRESETS_DEFAULT,
  approximatePopulationFractionFromEquivDisposableNet,
  defaultTaxSimBasePap,
  destatisHaushaltstypTyp1Counts2025,
  destatisHaushaltstypTyp1EquivNetQuartilesEUR2025,
  destatisMikrozensusFamilien2_12025NachLebensformUndKinderzahl,
  drawSingleTaxBurdenSim,
  hqEquivDisposableNetFromPopulationRankTriple,
  mergeDemographicsForDecile,
  mulberry32,
  populationShareHaushaltstypTyp12025,
  sampleMikrozensus2025FamilienKinderzahlAlleinerziehende,
  sampleMikrozensus2025FamilienPaarMitKindKinderzahlUndMZLebensform,
  simulateTaxBurdenDistribution,
  wageDecileFromPrimarySplinePercent,
} from './tax_distribution_sim'

const tinyConfig = {
  ...DEMOGRAPHIC_SIM_PRESETS_DEFAULT,
  sampleSize: 400,
  rngSeed: 20260202,
  year: 2026 as const,
  basePap: defaultTaxSimBasePap(2026),
}

describe('wageDecile + merge demographics', () => {
  it('ceil-decile mapping', () => {
    expect(wageDecileFromPrimarySplinePercent(1)).toBe(1)
    expect(wageDecileFromPrimarySplinePercent(10)).toBe(1)
    expect(wageDecileFromPrimarySplinePercent(10.1)).toBe(2)
    expect(wageDecileFromPrimarySplinePercent(99)).toBe(10)
  })

  it('per-decile row overrides globals', () => {
    const cfg = {
      ...tinyConfig,
      pMarried: 0.1,
      demographicsPerWageDecile: Array.from({ length: 10 }, (_, i) => (i === 9 ? { pMarried: 0.95 } : {})),
    }
    expect(mergeDemographicsForDecile(cfg, 1).pMarried).toBeCloseTo(0.1)
    expect(mergeDemographicsForDecile(cfg, 10).pMarried).toBeCloseTo(0.95)
  })
})

describe('Destatis Nettoäquivalenz Haushaltstyp 1 (person weights)', () => {
  it('embedded counts match published inner categories (Feb 2026 table)', () => {
    expect(destatisHaushaltstypTyp1Counts2025.personsThousands.alleinlebende).toBe(17318)
    expect(destatisHaushaltstypTyp1Counts2025.personsThousands.zwei_erwachsene_mit_kindern).toBe(26515)
  })

  it('population shares normalise without throwing', () => {
    const shares = populationShareHaushaltstypTyp12025()
    const sumShares = Object.values(shares).reduce((a, b) => a + b, 0)
    expect(sumShares).toBeCloseTo(1, 6)
    const pts = destatisHaushaltstypTyp1Counts2025.personsThousands
    const denom = Object.values(pts).reduce((a, b) => a + b, 0)
    expect(shares.zwei_erwachsene_ohne_kind).toBeCloseTo(24948 / denom, 5)
  })

  it('recover marginal filing + children prevalence from simulated draws', () => {
    const shares = populationShareHaushaltstypTyp12025()
    const pMarriedFilings =
      shares.zwei_erwachsene_ohne_kind +
      shares.drei_oder_mehr_erwachsene_ohne_kind +
      shares.zwei_erwachsene_mit_kindern +
      shares.sonstige_haushalte_mit_kindern
    const pAnyChildHousehold =
      shares.alleinerziehende + shares.zwei_erwachsene_mit_kindern + shares.sonstige_haushalte_mit_kindern

    const cfg = {
      ...DEMOGRAPHIC_SIM_PRESETS_DEFAULT,
      householdSampling: 'destatis_net_equiv_typ1_persons_2025',
      sampleSize: 32000,
      rngSeed: 20260502,
      year: 2026 as const,
      basePap: defaultTaxSimBasePap(2026),
    }
    const { draws } = simulateTaxBurdenDistribution(cfg)

    const pMarried = draws.filter((d) => d.filing === 'married').length / draws.length
    const pKids = draws.filter((d) => d.children >= 1).length / draws.length

    expect(pMarried).toBeGreaterThan(pMarriedFilings - 0.03)
    expect(pMarried).toBeLessThan(pMarriedFilings + 0.03)
    expect(pKids).toBeGreaterThan(pAnyChildHousehold - 0.03)
    expect(pKids).toBeLessThan(pAnyChildHousehold + 0.03)
    expect(draws.every((d) => d.haushaltstyp !== undefined)).toBe(true)
  })
})

describe('Äquivalentnet‑quartiles → Gesamt surrogate rank helpers', () => {
  const g = destatisHaushaltstypTyp1EquivNetQuartilesEUR2025.gemeinsamt

  it('hits published quartile € at internal knot ranks', () => {
    expect(hqEquivDisposableNetFromPopulationRankTriple(g, 0.25)).toBeCloseTo(g.q25, 0)
    expect(hqEquivDisposableNetFromPopulationRankTriple(g, 0.5)).toBeCloseTo(g.q50, 0)
    expect(hqEquivDisposableNetFromPopulationRankTriple(g, 0.75)).toBeCloseTo(g.q75, 0)
  })

  it('inverts the gemeinsamt HQF tightly at the median knot', () => {
    const y = hqEquivDisposableNetFromPopulationRankTriple(g, 0.5)
    expect(approximatePopulationFractionFromEquivDisposableNet(g, y)).toBeCloseTo(0.5, 2)
  })
})

describe('bridged primary brute vs poorer Haushaltstyp', () => {
  it('ranks Lone‑parents below three‑adult‑no‑child on average brute (Äquivalent→Gesamt→VSE heuristic)', () => {
    const cfg = {
      ...DEMOGRAPHIC_SIM_PRESETS_DEFAULT,
      householdSampling: 'destatis_net_equiv_typ1_persons_2025',
      primaryBruttoSampling: 'equiv_net_typ1_quartiles_to_gesamt_rank',
      sampleSize: 72000,
      rngSeed: 2026050321,
      year: 2026 as const,
      basePap: defaultTaxSimBasePap(2026),
    }
    const { draws } = simulateTaxBurdenDistribution(cfg)
    const meanIncome1 = (xs: typeof draws) =>
      xs.length ? xs.reduce((acc, d) => acc + d.income1, 0) / xs.length : 0
    const lo = draws.filter((d) => d.haushaltstyp === 'alleinerziehende')
    const hi = draws.filter((d) => d.haushaltstyp === 'drei_oder_mehr_erwachsene_ohne_kind')
    expect(lo.length).toBeGreaterThan(3000)
    expect(hi.length).toBeGreaterThan(300)
    expect(meanIncome1(lo)).toBeLessThan(meanIncome1(hi))
  })
})

describe('Mikrozensus Tab. 2 – 1 Familien Kinderzahl / Lebensform (2025 Erstergeb.)', () => {
  const a =
    destatisMikrozensusFamilien2_12025NachLebensformUndKinderzahl
      .alleinerziehendeFamiliesThousands
  const denomAE = a.EinKind + a.ZweiKinder + a.DreiUndMehrKinder

  it('Alleinerziehende child-count strata ~ published shares', () => {
    const rng = mulberry32(2026050366)
    const n = 60_000
    let one = 0
    let two = 0
    let tp = 0
    for (let i = 0; i < n; i++) {
      const c = sampleMikrozensus2025FamilienKinderzahlAlleinerziehende(8, rng)
      if (c === 1) one++
      else if (c === 2) two++
      else if (c >= 3) tp++
    }
    expect(one / n).toBeCloseTo(a.EinKind / denomAE, 2)
    expect(two / n).toBeCloseTo(a.ZweiKinder / denomAE, 2)
    expect(tp / n).toBeCloseTo(a.DreiUndMehrKinder / denomAE, 2)
  })

  it('Paired Kernfamilien: conditional P(Ehe|1 Kind) ~ Ehe-Spalten / Poolsumme', () => {
    const t =
      destatisMikrozensusFamilien2_12025NachLebensformUndKinderzahl.elternpaareMitKindThousands
    const w1 = t.einKindEhepaar + t.einKindLebensgemeinschaft
    const pOfficial = t.einKindEhepaar / w1
    let n = 0
    let ehe = 0
    const rng = mulberry32(2026050377)
    for (let i = 0; i < 96_000; i++) {
      const s = sampleMikrozensus2025FamilienPaarMitKindKinderzahlUndMZLebensform(8, rng)
      if (s.bucket !== 'ein_kind') continue
      n++
      if (s.mzFamilienform === 'ehepaar') ehe++
    }
    expect(n).toBeGreaterThan(12_000)
    expect(ehe / n).toBeCloseTo(pOfficial, 2)
  })
})

describe('simulateTaxBurdenDistribution', () => {
  it('is deterministic under fixed seed', () => {
    const a = simulateTaxBurdenDistribution(tinyConfig).summary
    const b = simulateTaxBurdenDistribution(tinyConfig).summary
    expect(a).toEqual(b)
    expect(a.n).toBe(400)
  })

  it('produces stable draws from mulberry stream', () => {
    const r = mulberry32(999)
    const first = Array.from({ length: 8 }, () => r())
    const again = mulberry32(999)
    const replay = Array.from({ length: 8 }, () => again())
    expect(first).toEqual(replay)
  })

  it('bundles sane burden quantiles after many draws', () => {
    const res = simulateTaxBurdenDistribution({ ...tinyConfig, sampleSize: 5000 }).summary
    expect(res.meanBurdenPct).toBeGreaterThan(14)
    expect(res.meanBurdenPct).toBeLessThan(48)
    expect(res.p90).toBeGreaterThanOrEqual(res.p50)
    expect(res.p50).toBeGreaterThanOrEqual(res.p10)
  })

  it('single marital branch works', () => {
    const rng = mulberry32(42)
    const draw = drawSingleTaxBurdenSim({ ...tinyConfig, pMarried: 0, sampleSize: 1, rngSeed: 41 }, rng)
    expect(draw.filing).toBe('single')
    expect(draw.wageDecile).toBeGreaterThanOrEqual(1)
    expect(draw.wageDecile).toBeLessThanOrEqual(10)
    expect(draw.primaryWagePercentile).toBeGreaterThan(0)
    expect(draw.totalGrossAnnual).toBeGreaterThan(0)
    expect(draw.totalBurdenPct).toBeGreaterThanOrEqual(0)
  })
})

describe('fixedHouseholdSketch on wage-decile path', () => {
  it('overrides global marriage / children draws', () => {
    const cfg = {
      ...tinyConfig,
      pMarried: 1,
      pChildrenAtLeastOne: 1,
      fixedHouseholdSketch: { filing: 'single', children: 0 },
      sampleSize: 300,
      rngSeed: 77,
    }
    const { draws } = simulateTaxBurdenDistribution(cfg)
    expect(draws.every((d) => d.filing === 'single')).toBe(true)
    expect(draws.every((d) => d.children === 0)).toBe(true)
  })

  it('forces one-earner married households when marriedDualEarner is false', () => {
    const cfg = {
      ...tinyConfig,
      fixedHouseholdSketch: { filing: 'married', children: 0, marriedDualEarner: false },
      sampleSize: 500,
      rngSeed: 88,
    }
    const { draws } = simulateTaxBurdenDistribution(cfg)
    expect(draws.every((d) => d.filing === 'married')).toBe(true)
    expect(draws.every((d) => d.income2 === 0)).toBe(true)
  })
})
