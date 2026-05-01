import React from 'react'
import { PapOptions, jaegFor } from '../lib/pap'
import { StklDerivation } from '../lib/stkl'

// PapOptions has three optional pro-mode override fields (bbgKvPv,
// bbgRvAlv, jaeg) that should remain optional in the UI settings as well —
// `undefined` means "use the year-specific default". Everything else is
// required.
type CorePapSettings = Required<Omit<PapOptions, 'bbgKvPv' | 'bbgRvAlv' | 'jaeg' | 'partnerRe4'>>

export type PapExplorerSettings = CorePapSettings & {
  income: number
  income1: number
  income2: number
  investmentIncome: number
  includeKindergeld: boolean
  kindergeldChildren: number
  rangeMin: number
  rangeMax: number
  proMode: boolean
  /** Beamte: no RV/ALV; Krankheit typisch Restkosten-PKV nach Beihilfe (pkv=2). */
  beamtenMode: boolean
  bbgKvPv?: number
  bbgRvAlv?: number
  jaeg?: number
}

type Props = {
  settings: PapExplorerSettings
  onChange: (next: PapExplorerSettings) => void
  stklDerivation: StklDerivation
}

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function DeferredRangeInput({
  value,
  min,
  max,
  step,
  ariaLabel,
  className,
  onCommit,
  suffix,
}: {
  value: number
  min: number
  max: number
  step: number
  ariaLabel: string
  className?: string
  onCommit: (value: number) => void
  suffix?: string
}) {
  const [draft, setDraft] = React.useState(value)
  const [active, setActive] = React.useState(false)

  React.useEffect(() => {
    if (!active) setDraft(value)
  }, [active, value])

  const commit = React.useCallback(() => {
    onCommit(draft)
    setActive(false)
  }, [draft, onCommit])

  return (
    <div>
      <input
        className={className}
        type="range"
        aria-label={ariaLabel}
        value={draft}
        min={min}
        max={max}
        step={step}
        onPointerDown={() => setActive(true)}
        onInput={(e) => setDraft(numberValue(e.currentTarget.value))}
        onPointerUp={commit}
        onMouseUp={commit}
        onTouchEnd={commit}
        onBlur={commit}
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') commit()
        }}
      />
      <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>
        Slider value: {Math.round(draft).toLocaleString()}{suffix ? ` ${suffix}` : ''}
      </div>
    </div>
  )
}

export default function TaxInput({ settings, onChange, stklDerivation }: Props) {
  const update = <K extends keyof PapExplorerSettings>(key: K, value: PapExplorerSettings[K]) => {
    onChange({ ...settings, [key]: value })
  }
  const investmentSliderMax = Math.max(20000, Math.ceil((settings.investmentIncome * 1.5 + 5000) / 1000) * 1000)

  const updateIncomePart = (key: 'income1' | 'income2', value: number) => {
    const next = { ...settings, [key]: value }
    onChange({ ...next, income: next.income1 + next.income2 })
  }

  const updateFiling = (filing: PapExplorerSettings['filing']) => {
    if (filing === 'married') {
      onChange({
        ...settings,
        filing,
        income1: settings.income1 || settings.income,
        income2: settings.income2 || 0,
      })
    } else {
      onChange({ ...settings, filing, income: settings.income1 + settings.income2 })
    }
  }

  const updatePkv = (mode: PapExplorerSettings['pkv']) => {
    if (settings.beamtenMode && mode !== 2) return
    if (mode === 0) {
      onChange({ ...settings, pkv: mode })
      return
    }
    // Switching from GKV to PKV: seed sensible monthly defaults if the user
    // has never entered any. EUR 600/month premium, EUR 300/month subsidy.
    onChange({
      ...settings,
      pkv: mode,
      pkpv: settings.pkpv || 60000,
      pkpvagz: settings.pkpvagz || 30000,
    })
  }

  const toggleBeamtenMode = (enabled: boolean) => {
    if (enabled) {
      onChange({
        ...settings,
        beamtenMode: true,
        krv: 1,
        alv: 1,
        pkv: 2,
        // Residual PKV after Beihilfe — order of magnitude for active Beamte; adjust freely.
        pkpv: settings.pkpv > 0 ? settings.pkpv : 25_000,
        pkpvagz: settings.pkpvagz > 0 ? settings.pkpvagz : 12_500,
      })
    } else {
      onChange({
        ...settings,
        beamtenMode: false,
        krv: 0,
        alv: 0,
        pkv: 0,
        pkpv: 0,
        pkpvagz: 0,
      })
    }
  }

  const updateKindergeld = (enabled: boolean) => {
    onChange({
      ...settings,
      includeKindergeld: enabled,
      kindergeldChildren: enabled && settings.kindergeldChildren === 0
        ? Math.max(1, Math.round(settings.children))
        : settings.kindergeldChildren,
    })
  }

  return (
    <aside className="control-panel">
      <div className="control-section">
        <h2>Range</h2>
        <label>
          {settings.filing === 'married' ? 'Combined income' : 'Income'}
          <input type="number" value={settings.income} min={0} step={1000} onChange={(e) => update('income', numberValue(e.target.value))} />
        </label>
        <DeferredRangeInput
          className="income-slider"
          ariaLabel="Income slider"
          value={settings.income}
          min={settings.rangeMin}
          max={settings.rangeMax}
          step={100}
          onCommit={(value) => update('income', value)}
          suffix="EUR"
        />
        {settings.filing === 'married' && (
          <div className="income-split">
            <label>
              Income 1
              <input type="number" value={settings.income1} min={0} step={1000} onChange={(e) => updateIncomePart('income1', numberValue(e.target.value))} />
            </label>
            <DeferredRangeInput
              className="income-slider"
              ariaLabel="Income 1 slider"
              value={settings.income1}
              min={0}
              max={settings.rangeMax}
              step={100}
              onCommit={(value) => updateIncomePart('income1', value)}
              suffix="EUR"
            />
            <label>
              Income 2
              <input type="number" value={settings.income2} min={0} step={1000} onChange={(e) => updateIncomePart('income2', numberValue(e.target.value))} />
            </label>
            <DeferredRangeInput
              className="income-slider"
              ariaLabel="Income 2 slider"
              value={settings.income2}
              min={0}
              max={settings.rangeMax}
              step={100}
              onCommit={(value) => updateIncomePart('income2', value)}
              suffix="EUR"
            />
          </div>
        )}
      </div>

      <div className="control-section pro-mode-section">
        <h2>
          Pro mode
          <label className="checkbox-row pro-mode-toggle">
            <input
              type="checkbox"
              checked={settings.proMode}
              onChange={(e) =>
                onChange({
                  ...settings,
                  proMode: e.target.checked,
                  // Clear overrides when leaving pro mode so the calc cleanly
                  // falls back to year defaults.
                  ...(e.target.checked
                    ? {}
                    : { bbgKvPv: undefined, bbgRvAlv: undefined, jaeg: undefined }),
                })
              }
            />
            Enable
          </label>
        </h2>
        {settings.proMode && (
          <>
            <p className="pro-mode-hint">
              Override social-insurance ceilings and JAEG to model reform scenarios. These affect deductions,
              contributions, and tax only — <strong>gross RE4 does not change</strong>. Leave a field blank to use the{' '}
              {settings.year} statutory default.
            </p>
            <div className="pro-mode-presets">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...settings,
                    bbgKvPv: undefined,
                    bbgRvAlv: undefined,
                    jaeg: undefined,
                  })
                }
              >
                Reset to {settings.year} defaults
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...settings,
                    bbgKvPv: 73_350,
                    bbgRvAlv: undefined,
                    jaeg: 81_000,
                  })
                }
              >
                Apply Kabinett 2026 reform
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...settings,
                    bbgKvPv: 73_350,
                    bbgRvAlv: 121_680,
                    jaeg: 81_000,
                  })
                }
              >
                + Klingbeil pension cap (2× → ~2.4×)
              </button>
            </div>
            <label>
              BBG KV/PV (annual EUR)
              <input
                type="number"
                value={settings.bbgKvPv ?? ''}
                placeholder={settings.year === 2026 ? '69750' : '66150'}
                min={0}
                step={1000}
                onChange={(e) => {
                  const raw = e.target.value
                  update('bbgKvPv', raw === '' ? undefined : Math.max(0, Math.round(numberValue(raw))))
                }}
              />
            </label>
            <label>
              BBG RV/AV (annual EUR)
              <input
                type="number"
                value={settings.bbgRvAlv ?? ''}
                placeholder={settings.year === 2026 ? '101400' : '96600'}
                min={0}
                step={1000}
                onChange={(e) => {
                  const raw = e.target.value
                  update('bbgRvAlv', raw === '' ? undefined : Math.max(0, Math.round(numberValue(raw))))
                }}
              />
            </label>
            <label>
              JAEG (annual EUR)
              <input
                type="number"
                value={settings.jaeg ?? ''}
                placeholder={settings.year === 2026 ? '77400' : '73800'}
                min={0}
                step={1000}
                onChange={(e) => {
                  const raw = e.target.value
                  update('jaeg', raw === '' ? undefined : Math.max(0, Math.round(numberValue(raw))))
                }}
              />
            </label>
          </>
        )}
      </div>

      <div className="control-section">
        <h2>Tax inputs</h2>
        <label>
          Year
          <select value={settings.year} onChange={(e) => update('year', Number(e.target.value) as PapExplorerSettings['year'])}>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
        </label>
        <label>
          Filing
          <select value={settings.filing} onChange={(e) => updateFiling(e.target.value as PapExplorerSettings['filing'])}>
            <option value="single">Single</option>
            <option value="married">Married</option>
          </select>
        </label>
        <div className="stkl-display">
          <div className="stkl-display-header">
            <span className="stkl-label">Steuerklasse</span>
            <span className="stkl-pills">
              <span className="stkl-pill stkl-pill-you">You: {stklDerivation.stkl}</span>
              {stklDerivation.partnerStkl !== null && (
                <span className="stkl-pill stkl-pill-spouse">Spouse: {stklDerivation.partnerStkl}</span>
              )}
            </span>
          </div>
          <p className="stkl-reason">{stklDerivation.reason}</p>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.beamtenMode}
            onChange={(e) => toggleBeamtenMode(e.target.checked)}
          />
          Beamtenmodus
        </label>
        {settings.beamtenMode && (
          <p className="beamten-hint">
            Modelliert typische Eckpunkte für Beamte im Lohnsteuer-PAP:{' '}
            <strong>keine Abzüge zur gesetzlichen Rentenversicherung (GRV)</strong> und{' '}
            <strong>keine Arbeitslosenversicherung</strong>{' '}
            — das ist korrekt, weil die Altersversorgung über die{' '}
            <strong>Beamtenversorgung</strong> (Versorgungsbezüge vom Dienstherren) läuft, nicht über RV-Beiträge vom Gehalt.{' '}
            Krankheit über <strong>Beihilfe</strong> und verbleibende <strong>private Krankenversicherung</strong>{' '}
            (Restpremie minus Dienstherren-Zuschuss). PAP-Felder: <code>krv=1</code>, <code>alv=1</code>,{' '}
            <code>pkv=2</code>. Freiwillige GRV o. Ä. sind möglich, aber Standard ist anders; kein Anspruch auf Vollständigkeit.
          </p>
        )}
        <label>
          Child allowance factor / ZKF
          <input type="number" value={settings.children} min={0} step={0.5} onChange={(e) => update('children', numberValue(e.target.value))} />
        </label>
        <label>
          Investment income (annual)
          <input type="number" value={settings.investmentIncome} min={0} step={100} onChange={(e) => update('investmentIncome', numberValue(e.target.value))} />
        </label>
        <DeferredRangeInput
          className="income-slider"
          ariaLabel="Investment income slider"
          value={settings.investmentIncome}
          min={0}
          max={investmentSliderMax}
          step={50}
          onCommit={(value) => update('investmentIncome', value)}
          suffix="EUR"
        />
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.includeKindergeld} onChange={(e) => updateKindergeld(e.target.checked)} />
          Include Kindergeld
        </label>
        {settings.includeKindergeld && (
          <label>
            Kindergeld children
            <input type="number" value={settings.kindergeldChildren} min={0} step={1} onChange={(e) => update('kindergeldChildren', Math.max(0, Math.floor(numberValue(e.target.value))))} />
          </label>
        )}
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.solidarity} onChange={(e) => update('solidarity', e.target.checked)} />
          Solidarity surcharge
        </label>
        <label>
          Church rate
          <select value={settings.churchRate} onChange={(e) => update('churchRate', numberValue(e.target.value))}>
            <option value={0}>None</option>
            <option value={0.08}>8%</option>
            <option value={0.09}>9%</option>
          </select>
        </label>
      </div>

      <div className="control-section">
        <h2>Insurance</h2>
        {(() => {
          const jaeg = jaegFor(settings.year, settings.jaeg)
          const userSalary = settings.filing === 'married' ? settings.income1 : settings.income
          const meetsJaeg = userSalary >= jaeg
          const pkvEmployeeBlocked = settings.pkv === 1 && !meetsJaeg && !settings.beamtenMode
          return (
            <>
              <label>
                Health insurance
                <select
                  value={settings.pkv}
                  disabled={settings.beamtenMode}
                  onChange={(e) => updatePkv(Number(e.target.value) as PapExplorerSettings['pkv'])}
                >
                  <option value={0}>Gesetzlich (GKV)</option>
                  <option value={1}>Privat (PKV)</option>
                  <option value={2}>Privat + Beihilfe (Beamte)</option>
                </select>
              </label>
              {settings.beamtenMode ? (
                <p className="insurance-hint">
                  <strong>Beamtenmodus</strong> fixiert <code>pkv=2</code> (Privat + Beihilfe). Im PAP ist die Kranken-/Pflege-Vorsorgepauschale wie bei PKV:{' '}
                  <strong>Jahresbetrag = 12 × (Prämie − Zuschuss Dienstherr)</strong> in EUR. Die{' '}
                  <strong>Beihilfe</strong> selbst steht nicht als eigener EUR-Betrag in der Formel — typischerweise trägst du die{' '}
                  <em>Rest-KV</em> nach Beihilfe (oder die volle Vertragsprämie, wenn du den staatlichen Anteil komplett als „Zuschuss“ erfasst). GKV und JAEG spielen hier keine Rolle.
                </p>
              ) : (
                <>
                  <p className="insurance-hint">
                    Versicherungspflichtgrenze (JAEG) {settings.year}: EUR {jaeg.toLocaleString()}/year. Employees may only switch from GKV to PKV once their gross salary exceeds this threshold. Beamte and the self-employed are exempt.
                  </p>
                  {pkvEmployeeBlocked && (
                    <p className="insurance-warning">
                      ⚠ Your salary of EUR {userSalary.toLocaleString()}/year is below the JAEG of EUR {jaeg.toLocaleString()}/year. As a regular employee you cannot opt out of GKV into PKV. The model is still computing PKV numbers, but this scenario is not legally possible without changing employment status (e.g. becoming self-employed or a civil servant).
                    </p>
                  )}
                </>
              )}
            </>
          )
        })()}

        {settings.pkv === 0 ? (
          <>
            <label>
              KV Zusatzbeitrag %
              <input
                type="number"
                value={settings.kvz}
                min={0}
                step={0.1}
                onChange={(e) => update('kvz', numberValue(e.target.value))}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.pvs === 1}
                onChange={(e) => update('pvs', e.target.checked ? 1 : 0)}
              />
              Saxony care rate
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.pvz === 1}
                onChange={(e) => update('pvz', e.target.checked ? 1 : 0)}
              />
              Childless care surcharge
            </label>
            <label>
              Care child reduction
              <input
                type="number"
                value={settings.pva}
                min={0}
                max={4}
                step={1}
                onChange={(e) => update('pva', numberValue(e.target.value))}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              {settings.beamtenMode ? 'PKV monthly premium (full contract gross, EUR)' : 'PKV premium (EUR / month)'}
              <input
                type="number"
                value={Math.round(settings.pkpv / 100)}
                min={0}
                step={10}
                onChange={(e) => update('pkpv', Math.max(0, Math.round(numberValue(e.target.value))) * 100)}
              />
            </label>
            <label>
              {settings.beamtenMode ? 'Dienstherren-Zuschuss (EUR / month)' : 'Employer subsidy (EUR / month)'}
              <input
                type="number"
                value={Math.round(settings.pkpvagz / 100)}
                min={0}
                step={10}
                onChange={(e) => update('pkpvagz', Math.max(0, Math.round(numberValue(e.target.value))) * 100)}
              />
            </label>
            <p className="insurance-hint">
              {settings.beamtenMode
                ? 'PAP subtracts only (Prämie − Dienstherren-Zuschuss) for the deductible Vorsorge amount. If your tariff already reflects Beihilfe (Resttarif), put that residual premium in the first field and set the Zuschuss to 0 — or split Grossprämie vs. state contribution however matches your payslip.'
                : settings.pkv === 1
                  ? 'PKV employees pay the full premium minus an employer subsidy. The Arbeitgeberzuschuss is statutorily capped at 50 % of the premium, and at half the maximum GKV contribution (≈ EUR 471 / month in 2026).'
                  : 'Beihilfeberechtigte (Beamte) only insure the share not covered by Beihilfe — typically ~30 % for active officials, ~30 % for retirees with families, etc. Enter that residual premium here.'}
            </p>
          </>
        )}
      </div>

    </aside>
  )
}
