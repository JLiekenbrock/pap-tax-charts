import { PapCalculationResult, PapOptions, calculatePapResultFromRE4 } from './pap'
import { actualContributions, marginalTaxRate } from './rates'

export type TipTone = 'serious' | 'cheeky' | 'absurd'

export type Tip = {
  id: string
  emoji?: string
  title: string
  description: string
  /** Estimated annual EUR saving compared to the user's current state. Undefined for purely informational tips. */
  savings?: number
  tone: TipTone
}

const eur = (value: number) => `EUR ${Math.round(value).toLocaleString()}`

export type TipInputs = {
  result: PapCalculationResult
  options: PapOptions
  /** Earnings of partner 1 in a married filing (used to quantify splitting benefit). */
  partner1Income?: number
  /** Earnings of partner 2. */
  partner2Income?: number
}

/**
 * Run a counterfactual PAP calculation with `overrides` applied on top of
 * the user's current settings. Used to estimate "what would I owe if X?".
 */
function counterfactual(income: number, base: PapOptions, overrides: PapOptions): PapCalculationResult {
  return calculatePapResultFromRE4(income, { ...base, ...overrides })
}

export function computeTips({ result, options, partner1Income, partner2Income }: TipInputs): Tip[] {
  const tips: Tip[] = []
  const filing = options.filing ?? 'single'
  const children = options.children ?? 0
  const investmentIncome = options.investmentIncome ?? 0
  const churchRate = options.churchRate ?? 0
  const solidarity = options.solidarity ?? false

  // Marginal payroll-tax rate per EUR of additional ZVE, expressed as a
  // fraction (e.g. 0.37 = 37 %). This is the headline multiplier for any
  // Sonderausgabenabzug (Rürup, donations, Werbungskosten beyond the
  // EUR 1,230 Pauschbetrag, etc.). Includes Soli + church.
  // `marginalTaxRate` returns a percentage, so divide by 100.
  const marginalZveRate = result.income > 0
    ? marginalTaxRate(result.income, options, 'zve', { delta: 1000, includeVspInRate: false }) / 100
    : 0

  // ---- Serious wins -------------------------------------------------------

  // Sparer-Pauschbetrag still has headroom.
  const saverAllowance = filing === 'married' ? 2000 : 1000
  if (investmentIncome < saverAllowance) {
    const unused = saverAllowance - investmentIncome
    tips.push({
      id: 'saver-allowance',
      emoji: '📈',
      title: 'Use your Sparer-Pauschbetrag',
      description: `You have ${eur(unused)} of saver allowance unused. Dividends and realised capital gains up to that amount are tax-free.`,
      tone: 'serious',
    })
  }

  // Salary -> capital-gains arbitrage (Abgeltungsteuer 25% beats top marginal).
  if (result.income > 0) {
    const upper = counterfactual(result.income + 1000, options, {})
    const lower = counterfactual(Math.max(0, result.income - 1000), options, {})
    const span = (result.income + 1000) - Math.max(0, result.income - 1000)
    const marginalSalaryRate = span > 0 ? (upper.payrollTax - lower.payrollTax) / span : 0
    const cgtRate = 0.25 * (1 + (solidarity ? 0.055 : 0) + churchRate)
    if (marginalSalaryRate > cgtRate + 0.02) {
      const swap = 10_000
      const savings = (marginalSalaryRate - cgtRate) * swap
      const ppDiff = (marginalSalaryRate - cgtRate) * 100
      tips.push({
        id: 'invest-vs-salary',
        emoji: '💸',
        title: 'Shift income from salary to dividends',
        description: `Your marginal rate on salary is about ${(marginalSalaryRate * 100).toFixed(1)}%; capital gains pay a flat ${(cgtRate * 100).toFixed(1)}%. ` +
          `Routing ${eur(swap)} of compensation through a holding/dividend strategy would save roughly ${eur(savings)} per year (${ppDiff.toFixed(1)} pp).`,
        savings,
        tone: 'serious',
      })
    }
  }

  // Just above the Soli threshold.
  const SOLZ_FREE_2026 = 20_350
  const SOLZ_FREE_2025 = 19_950
  const solzFree = options.year === 2025 ? SOLZ_FREE_2025 : SOLZ_FREE_2026
  if (solidarity && result.base > solzFree && result.base < solzFree * 1.04) {
    const overshoot = result.base - solzFree
    tips.push({
      id: 'soli-edge',
      emoji: '🪙',
      title: 'You just barely owe Soli',
      description: `Your income tax base is only ${eur(overshoot)} above the Solidaritätszuschlag Freigrenze (${eur(solzFree)}). You are still inside the Milderungszone (11.9 % taper), so any extra Werbungskosten, Sonderausgaben, or a Riester contribution that pushes the base back below ${eur(solzFree)} eliminates the surcharge entirely.`,
      tone: 'serious',
    })
  }

  // Rürup / Basisrente — 100 % deductible Sonderausgabe, cap ≈ EUR 28k/yr.
  if (result.income > 30_000 && marginalZveRate > 0.15) {
    const ruerup = 6_000
    const savings = marginalZveRate * ruerup
    if (savings > 200) {
      tips.push({
        id: 'ruerup-pension',
        emoji: '🏦',
        title: 'Pay into a Rürup / Basisrente',
        description: `Contributions to a Basisrente are 100 % deductible as Sonderausgaben (cap ~EUR 28,000/yr in 2026). At your marginal rate of ${(marginalZveRate * 100).toFixed(1)} %, paying ${eur(ruerup)} into one would reduce this year's tax by about ${eur(savings)}. The money is locked until retirement, but the deduction is real.`,
        savings,
        tone: 'serious',
      })
    }
  }

  // Charitable donations — Sonderausgaben, deductible up to 20 % of GdE.
  if (result.income > 25_000 && marginalZveRate > 0.15) {
    const donation = 1_000
    const savings = marginalZveRate * donation
    if (savings > 100) {
      tips.push({
        id: 'donation',
        emoji: '🎁',
        title: 'Donate to a recognised charity',
        description: `Spenden up to 20 % of your Gesamtbetrag der Einkünfte are fully deductible. A ${eur(donation)} donation costs you only ${eur(donation - savings)} after the ${eur(savings)} tax saving at your marginal rate of ${(marginalZveRate * 100).toFixed(1)} %.`,
        savings,
        tone: 'serious',
      })
    }
  }

  // Werbungskosten beyond the 1,230 EUR (single) / 1,230 EUR Pauschbetrag.
  if (result.income > 25_000 && marginalZveRate > 0.15) {
    const extra = 1_000
    const savings = marginalZveRate * extra
    if (savings > 100) {
      tips.push({
        id: 'werbungskosten',
        emoji: '🚗',
        title: 'Itemize Werbungskosten beyond the EUR 1,230 Pauschbetrag',
        description: `Pendlerpauschale (0.30 EUR/km, 0.38 EUR/km from km 21), home-office Tagespauschale (6 EUR/day, max 1,260 EUR/yr), professional literature, training, work clothes, second-degree fees — all stack above the Pauschbetrag. Each additional ${eur(extra)} of receipts saves about ${eur(savings)} in tax.`,
        savings,
        tone: 'serious',
      })
    }
  }

  // § 35a EStG — direct Steuerermäßigung (not a deduction). High leverage.
  if (result.tax > 1_000) {
    tips.push({
      id: 'haushalt-handwerker',
      emoji: '🔧',
      title: '§ 35a — Haushaltsnahe & Handwerkerleistungen',
      description: `Bills for cleaners, gardeners, household help: 20 % deducted directly from your tax (max ${eur(4000)}/yr). Craftsmen invoices for repairs, painters, heating service, etc.: 20 % off, max ${eur(1200)}/yr. That is up to ${eur(5200)}/yr in tax credits — far more efficient than any Sonderausgabenabzug because it cuts the tax bill EUR-for-EUR rather than the taxable income.`,
      tone: 'serious',
    })
  }

  // Splitting benefit visualisation for already-married two-earner couples.
  if (
    filing === 'married' &&
    typeof partner1Income === 'number' &&
    typeof partner2Income === 'number' &&
    partner1Income > 0 &&
    partner2Income > 0
  ) {
    const single1 = calculatePapResultFromRE4(partner1Income, { ...options, filing: 'single' })
    const single2 = calculatePapResultFromRE4(partner2Income, { ...options, filing: 'single' })
    const benefit = single1.tax + single2.tax - result.tax
    if (benefit > 100) {
      tips.push({
        id: 'splitting-benefit',
        emoji: '👫',
        title: 'You already win via Ehegattensplitting',
        description: `If both of you filed individually, your combined annual tax would be ${eur(single1.tax + single2.tax)} (${eur(single1.tax)} + ${eur(single2.tax)}). Joint filing brings it down to ${eur(result.tax)} — splitting saves you ${eur(benefit)}/year. ` +
          `Steuerklassen 3/5 vs 4/4 only shifts when the tax is withheld; the annual total is identical.`,
        savings: benefit,
        tone: 'serious',
      })
    }
  }

  // ---- Cheeky lifestyle suggestions --------------------------------------

  // Marry someone with no income.
  if (filing === 'single' && result.income > 25_000) {
    const married = counterfactual(result.income, options, { filing: 'married' })
    const savings = result.tax - married.tax
    if (savings > 100) {
      tips.push({
        id: 'marry-zero',
        emoji: '💍',
        title: 'Get married — to anyone',
        description: `Marrying someone who earns nothing unlocks the Ehegattensplitting tariff. At your income that turns ${eur(result.tax)} of annual tax into ${eur(married.tax)} — a saving of ${eur(savings)}/year. ` +
          `Total wedding catering budget at registry office: ~EUR 80.`,
        savings,
        tone: 'cheeky',
      })
    }
  }

  // Have children (Kinderfreibetrag wins at higher incomes).
  if (children === 0 && result.income > 50_000) {
    const oneChild = counterfactual(result.income, options, { children: 1 })
    const twoChildren = counterfactual(result.income, options, { children: 2 })
    const oneSavings = result.tax - oneChild.tax
    const twoSavings = result.tax - twoChildren.tax
    if (oneSavings > 100) {
      tips.push({
        id: 'have-children',
        emoji: '👶',
        title: 'Have a child. Or two.',
        description: `Each Kinderfreibetrag (currently ${eur(9756)}/child for 2026) would save you ${eur(oneSavings)}/year (one child) or ${eur(twoSavings)}/year (two). ` +
          `Diaper budget not included.`,
        savings: oneSavings,
        tone: 'cheeky',
      })
    }
  }

  // Kirchenaustritt.
  if (churchRate > 0) {
    const noChurch = counterfactual(result.income, options, { churchRate: 0 })
    const savings = result.tax - noChurch.tax
    if (savings > 0) {
      tips.push({
        id: 'church-exit',
        emoji: '⛪',
        title: 'Kirchenaustritt',
        description: `Formally leaving the church saves ${eur(savings)}/year on church tax. One-time cost at the registry office is around EUR 30. ` +
          `Spiritual cost at your discretion.`,
        savings,
        tone: 'cheeky',
      })
    }
  }

  // ---- Absurd anchor ------------------------------------------------------

  if (result.tax > 5_000) {
    const social = actualContributions(result)
    const fullBurden = result.tax + social
    tips.push({
      id: 'move-dubai',
      emoji: '🏝️',
      title: 'Emigrate to Dubai',
      description: `You'd save your entire annual tax + social bill of ${eur(fullBurden)}. Sandstorm allowance and 45 °C summers not included. Strongly not recommended; included for scale.`,
      savings: fullBurden,
      tone: 'absurd',
    })
  }

  // Sort: serious first, then cheeky, then absurd. Within each tone, by savings.
  const toneOrder: Record<TipTone, number> = { serious: 0, cheeky: 1, absurd: 2 }
  return tips.sort((a, b) => {
    if (toneOrder[a.tone] !== toneOrder[b.tone]) return toneOrder[a.tone] - toneOrder[b.tone]
    return (b.savings ?? 0) - (a.savings ?? 0)
  })
}
