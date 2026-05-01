import React from 'react'
import { PapCalculationResult, PapOptions } from '../lib/pap'
import { Tip, computeTips } from '../lib/tips'

type Props = {
  result: PapCalculationResult
  options: PapOptions
  partner1Income?: number
  partner2Income?: number
}

const toneClass: Record<Tip['tone'], string> = {
  serious: 'tip-card tip-serious',
  cheeky: 'tip-card tip-cheeky',
  absurd: 'tip-card tip-absurd',
}

export default function TaxTips({ result, options, partner1Income, partner2Income }: Props) {
  const tips = React.useMemo(
    () => computeTips({ result, options, partner1Income, partner2Income }),
    [result, options, partner1Income, partner2Income],
  )

  if (tips.length === 0) {
    return null
  }

  return (
    <section className="tax-tips">
      <h2>Tax tips & lifestyle suggestions</h2>
      <p className="tax-tips-blurb">Computed against your current PAP inputs. Some are practical, some are absurd. All numbers are real.</p>
      <ul className="tax-tips-list">
        {tips.map((tip) => (
          <li key={tip.id} className={toneClass[tip.tone]}>
            <header>
              <span className="tip-emoji" aria-hidden>{tip.emoji}</span>
              <h3>{tip.title}</h3>
              {typeof tip.savings === 'number' && tip.savings > 0 && (
                <span className="tip-savings">save ~EUR {Math.round(tip.savings).toLocaleString()}/yr</span>
              )}
            </header>
            <p>{tip.description}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
