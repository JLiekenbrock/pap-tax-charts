import type { PapExplorerSettings } from '../components/TaxInput'
import { nominalEuroFromRealEuro, realEuroFromNominalEuro } from './germany_vpi_annual'

/** One wage‑like input interpreted in **Konstant‑EUR**, **Konstant‑Preisbasis `realIncomeBaseYear`**, iff `realIncomeMode`. */
export function explorerNominalWageEUR(
  storedEUR: number,
  tariffYear: number,
  explorer: Pick<PapExplorerSettings, 'realIncomeMode' | 'realIncomeBaseYear'>,
): number {
  if (!explorer.realIncomeMode) return Math.max(0, storedEUR)
  const priceBaseYear = explorer.realIncomeBaseYear ?? 2021
  return nominalEuroFromRealEuro(Math.max(0, storedEUR), tariffYear, priceBaseYear)
}

export function explorerStoredWageFromNominalEUR(
  nominalEUR: number,
  tariffYear: number,
  explorer: Pick<PapExplorerSettings, 'realIncomeMode' | 'realIncomeBaseYear'>,
): number {
  if (!explorer.realIncomeMode) return Math.max(0, nominalEUR)
  const priceBaseYear = explorer.realIncomeBaseYear ?? 2021
  return realEuroFromNominalEuro(Math.max(0, nominalEUR), tariffYear, priceBaseYear)
}

/** Horizontal-axis salary value: Konstant‑EUR in real mode (same units as sliders), nominal RE4 otherwise. */
export function explorerSalaryAxisEUR(
  nominalHouseholdRe4: number,
  tariffYear: number,
  explorer: Pick<PapExplorerSettings, 'realIncomeMode' | 'realIncomeBaseYear'>,
): number {
  return explorerStoredWageFromNominalEUR(nominalHouseholdRe4, tariffYear, explorer)
}

/**
 * Turn real-income mode on/off and re-express wage inputs (single or married)
 * between nominal tariff-year € and Konstant‑EUR at the current price base.
 * Investment income is untouched.
 */
export function explorerSettingsAfterRealIncomeToggle(
  enabled: boolean,
  settings: PapExplorerSettings,
): PapExplorerSettings {
  if (enabled === settings.realIncomeMode) return settings
  const y = settings.year
  const b = settings.realIncomeBaseYear ?? 2021
  if (enabled) {
    if (settings.filing === 'married') {
      const n1 = Math.max(0, settings.income1)
      const n2 = Math.max(0, settings.income2)
      const k1 = realEuroFromNominalEuro(n1, y, b)
      const k2 = realEuroFromNominalEuro(n2, y, b)
      return {
        ...settings,
        realIncomeMode: true,
        income1: k1,
        income2: k2,
        income: k1 + k2,
      }
    }
    const n = Math.max(0, settings.income)
    return { ...settings, realIncomeMode: true, income: realEuroFromNominalEuro(n, y, b) }
  }
  if (settings.filing === 'married') {
    const k1 = Math.max(0, settings.income1)
    const k2 = Math.max(0, settings.income2)
    const n1 = nominalEuroFromRealEuro(k1, y, b)
    const n2 = nominalEuroFromRealEuro(k2, y, b)
    return {
      ...settings,
      realIncomeMode: false,
      income1: n1,
      income2: n2,
      income: n1 + n2,
    }
  }
  const k = Math.max(0, settings.income)
  return { ...settings, realIncomeMode: false, income: nominalEuroFromRealEuro(k, y, b) }
}
