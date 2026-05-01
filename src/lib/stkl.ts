export type Stkl = 1 | 2 | 3 | 4 | 5 | 6

export type StklDerivation = {
  /** The user's own Steuerklasse. */
  stkl: Stkl
  /** Spouse's Steuerklasse, or `null` for single filers. */
  partnerStkl: Stkl | null
  /** Short, user-facing explanation of why this combination was chosen. */
  reason: string
}

/**
 * Derive the appropriate Steuerklasse from filing status, children, and the
 * income split. The return value is purely a recommendation — it matters
 * for two things in the PAP calculation:
 *
 *   1. EFA (Entlastungsbetrag für Alleinerziehende, EUR 4,260) is applied
 *      only for Steuerklasse 2.
 *   2. Splitting (kztab=2) kicks in for filing === 'married' OR stkl === 3.
 *
 * Annual tax for married couples is identical across the 4/4, 3/5 and
 * 4/4-mit-Faktor combinations — those choices only change *monthly*
 * Lohnsteuer withholding (i.e. cash-flow timing). The recommendation
 * picks whichever maximises monthly take-home for the higher earner.
 *
 * Steuerklasse 6 (additional employment) is never auto-recommended; it
 * has to be set deliberately for second jobs.
 */
export function deriveStkl(input: {
  filing: 'single' | 'married'
  /** Kinderfreibetrag count (may be fractional for shared custody). */
  children: number
  /** The user's own income. */
  income1: number
  /** Spouse's income (only meaningful when filing === 'married'). */
  income2: number
}): StklDerivation {
  const { filing, children, income1, income2 } = input

  if (filing === 'single') {
    if (children > 0) {
      return {
        stkl: 2,
        partnerStkl: null,
        reason: 'Single with at least one qualifying child → Steuerklasse 2. Includes the Entlastungsbetrag für Alleinerziehende (EUR 4,260 + EUR 240 per additional child).',
      }
    }
    return {
      stkl: 1,
      partnerStkl: null,
      reason: 'Single, divorced, or permanently separated, no qualifying children → Steuerklasse 1.',
    }
  }

  // Married: 4/4 by default; switch to 3/5 only when incomes are clearly unequal.
  const total = income1 + income2
  if (total === 0) {
    return {
      stkl: 4,
      partnerStkl: 4,
      reason: 'Married couple, no income data yet → both default to Steuerklasse 4.',
    }
  }

  const yourShare = income1 / total
  const higherShare = Math.max(yourShare, 1 - yourShare)
  // Switch to 3/5 only once one partner earns more than ~55 % of the joint
  // income. Below that the cash-flow benefit of 3/5 vs 4/4 is small and the
  // overpayment risk of 5 (steeper monthly tariff) on the lower earner makes
  // 4/4 the safer pick.
  if (higherShare <= 0.55) {
    return {
      stkl: 4,
      partnerStkl: 4,
      reason: 'Both partners earn within ~10 % of equal → Steuerklasse 4/4. (4/4 mit Faktor is a more precise variant the Finanzamt offers on request.)',
    }
  }

  if (income1 >= income2) {
    return {
      stkl: 3,
      partnerStkl: 5,
      reason: 'You earn more than your spouse → Steuerklasse 3/5. You take class 3 (low monthly withholding); your spouse takes class 5. Annual tax is identical to 4/4 — only the timing changes.',
    }
  }

  return {
    stkl: 5,
    partnerStkl: 3,
    reason: 'Your spouse earns more than you → Steuerklasse 5/3. Your spouse takes class 3 (low monthly withholding); you take class 5. Annual tax is identical to 4/4 — only the timing changes.',
  }
}
