import React from 'react'
import { PapCalculationResult, PapOptions } from '../lib/pap'
import { Tip, computeTips } from '../lib/tips'

type Props = {
  result: PapCalculationResult
  options: PapOptions
  partner1Income?: number
  partner2Income?: number
  beamtenMode?: boolean
}

const toneClass: Record<Tip['tone'], string> = {
  serious: 'tip-card tip-serious',
  cheeky: 'tip-card tip-cheeky',
  absurd: 'tip-card tip-absurd',
}

export default function TaxTips({ result, options, partner1Income, partner2Income, beamtenMode }: Props) {
  const tips = React.useMemo(
    () => computeTips({ result, options, partner1Income, partner2Income, beamtenMode }),
    [result, options, partner1Income, partner2Income, beamtenMode],
  )

  if (tips.length === 0) {
    return null
  }

  return (
    <details className="tax-tips-panel">
      <summary className="tax-tips-summary">Tax tips & lifestyle suggestions</summary>
      <div className="tax-tips-body">
        <p className="tax-tips-blurb">
          Computed against your current PAP inputs. Some are practical, some are absurd. All numbers are real.
        </p>
        <ul className="tax-tips-list">
          {tips.map((tip) => (
            <li key={tip.id} className={toneClass[tip.tone]}>
              <header>
                <span className="tip-emoji" aria-hidden>
                  {tip.emoji}
                </span>
                <h3>{tip.title}</h3>
                {typeof tip.savings === 'number' && tip.savings > 0 && (
                  <span className="tip-savings">save ~EUR {Math.round(tip.savings).toLocaleString()}/yr</span>
                )}
              </header>
              <p>{tip.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
