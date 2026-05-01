import { PapCalculationResult, PapOptions, calculatePapResultFromRE4 } from './pap'
import { actualContributions } from './rates'

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

type TipInputs = {
  result: PapCalculationResult
  options: PapOptions
  /** Total monthly Kindergeld * 12 currently received (or 0). Reused for break-even messaging. */
  kindergeldAnnual?: number
}

/**
 * Run a counterfactual PAP calculation with `overrides` applied on top of
 * the user's current settings. Used to estimate "what would I owe if X?".
 */
function counterfactual(income: number, base: PapOptions, overrides: PapOptions): PapCalculationResult {
  return calculatePapResultFromRE4(income, { ...base, ...overrides })
}

export function computeTips({ result, options }: TipInputs): Tip[] {
  const tips: Tip[] = []
  const filing = options.filing ?? 'single'
  const children = options.children ?? 0
  const investmentIncome = options.investmentIncome ?? 0
  const churchRate = options.churchRate ?? 0
  const solidarity = options.solidarity ?? false

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
