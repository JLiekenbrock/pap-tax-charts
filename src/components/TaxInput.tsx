import React from 'react'
import { PapOptions, jaegFor } from '../lib/pap'
import { StklDerivation } from '../lib/stkl'

export type PapExplorerSettings = Required<PapOptions> & {
  income: number
  income1: number
  income2: number
  investmentIncome: number
  includeKindergeld: boolean
  kindergeldChildren: number
  rangeMin: number
  rangeMax: number
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
          const jaeg = jaegFor(settings.year)
          const userSalary = settings.filing === 'married' ? settings.income1 : settings.income
          const meetsJaeg = userSalary >= jaeg
          const pkvEmployeeBlocked = settings.pkv === 1 && !meetsJaeg
          return (
            <>
              <label>
                Health insurance
                <select
                  value={settings.pkv}
                  onChange={(e) => updatePkv(Number(e.target.value) as PapExplorerSettings['pkv'])}
                >
                  <option value={0}>Gesetzlich (GKV)</option>
                  <option value={1}>Privat (PKV)</option>
                  <option value={2}>Privat + Beihilfe (Beamte)</option>
                </select>
              </label>
              <p className="insurance-hint">
                Versicherungspflichtgrenze (JAEG) {settings.year}: EUR {jaeg.toLocaleString()}/year. Employees may only switch from GKV to PKV once their gross salary exceeds this threshold. Beamte and the self-employed are exempt.
              </p>
              {pkvEmployeeBlocked && (
                <p className="insurance-warning">
                  ⚠ Your salary of EUR {userSalary.toLocaleString()}/year is below the JAEG of EUR {jaeg.toLocaleString()}/year. As a regular employee you cannot opt out of GKV into PKV. The model is still computing PKV numbers, but this scenario is not legally possible without changing employment status (e.g. becoming self-employed or a civil servant).
                </p>
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
              PKV premium (EUR / month)
              <input
                type="number"
                value={Math.round(settings.pkpv / 100)}
                min={0}
                step={10}
                onChange={(e) => update('pkpv', Math.max(0, Math.round(numberValue(e.target.value))) * 100)}
              />
            </label>
            <label>
              Employer subsidy (EUR / month)
              <input
                type="number"
                value={Math.round(settings.pkpvagz / 100)}
                min={0}
                step={10}
                onChange={(e) => update('pkpvagz', Math.max(0, Math.round(numberValue(e.target.value))) * 100)}
              />
            </label>
            <p className="insurance-hint">
              {settings.pkv === 1
                ? 'PKV employees pay the full premium minus an employer subsidy. The Arbeitgeberzuschuss is statutorily capped at 50 % of the premium, and at half the maximum GKV contribution (≈ EUR 471 / month in 2026).'
                : 'Beihilfeberechtigte (Beamte) only insure the share not covered by Beihilfe — typically ~30 % for active officials, ~30 % for retirees with families, etc. Enter that residual premium here.'}
            </p>
          </>
        )}
      </div>

    </aside>
  )
}
