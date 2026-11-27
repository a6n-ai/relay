import { useEffect, useState } from 'react'
import { Collapse } from '../stageshow/motion/Collapse'
import { States } from '../stageshow/motion/States'
import { Window } from '../stageshow/window'
import { type Act } from '../stageshow/act'
import { Crumbs, RStage, Side, Status } from './common'
import './hero.css'

// Hero: one request, and what the console shows. A curl in a terminal
// satellite returns 202; the message lands in Messages > Sent as Queued, moves
// to Sent, and a click on the row opens its timeline: Queued, Sent, Delivery.

export const CMD = `curl -X POST \\
  relay.a6n.ai/api/v1/messages \\
  -H "Authorization: Bearer $KEY" \\
  -d '{"stream":"transactional",
       "to":"ada@northwind.test", …}'`

export type S = { term: boolean; typed: string; resp: boolean; row: boolean; stat: 'queued' | 'sent'; sel: boolean; tl: number }

const POSTER: S = { term: true, typed: CMD, resp: true, row: true, stat: 'sent', sel: true, tl: 3 }
// The loop starts and ends on the poster, so the story takes over from it without a cut.
const initial: S = POSTER

const ROWS = [
  ['2 min ago', 'grace@northwind.test', 'Your receipt'],
  ['14 min ago', 'linus@northwind.test', 'Password reset'],
  ['1 hour ago', 'marie@northwind.test', 'Order shipped'],
  ['3 hours ago', 'alan@northwind.test', 'Invoice ready'],
] as const

export const REST = { wide: { x: 560, y: 120 }, compact: { x: 300, y: 80 } }

const TL = [
  ['Queued', '12:04:01'],
  ['Sent', '12:04:02'],
  ['Delivery', '12:04:04'],
] as const

type Script = (a: Act<S>) => Promise<void>

export function HeroStage({ script }: { script?: Script }) {
  return (
    <RStage<S>
      width={720}
      height={340}
      compact={{ below: 560, width: 358, height: 330 }}
      initial={initial}
      poster={POSTER}
      script={script}
      fill
      cursor={{ at: REST }}
      className="rlh"
    >
      {(s, _rect, layout) => {
        const term = layout === 'wide' ? s.term : s.term && !s.row
        const typedLines = s.typed.split('\n')
        return (
          <>
            <Window url="relay.a6n.ai/messages" className="rlh-win" receded={false}>
              <div className="rl-app rlh-app">
                {layout === 'wide' ? <Side on="Messages" /> : null}
                <div className="rl-main">
                  <Crumbs items={['Messages', 'Sent']} />
                  <div className="rl-grid" data-head>
                    {layout === 'wide' ? <span>When</span> : null}
                    <span>From / To</span>
                    {layout === 'wide' ? <span>Subject</span> : null}
                    <span>Status</span>
                  </div>
                  <Collapse open={s.row} reveal="drop">
                    <div className="rl-grid" data-sel={s.sel || undefined} data-target="row-new">
                      {layout === 'wide' ? <span className="rl-mute">Just now</span> : null}
                      <span>ada@northwind.test</span>
                      {layout === 'wide' ? <span className="rl-name">Welcome aboard</span> : null}
                      <span className="rl-st"><States value={s.stat} align="start" states={{ queued: <Status s="queued" />, sent: <Status s="sent" /> }} /></span>
                    </div>
                  </Collapse>
                  {ROWS.map(([when, to, subject]) => (
                    <div key={to} className="rl-grid">
                      {layout === 'wide' ? <span className="rl-mute">{when}</span> : null}
                      <span>{to}</span>
                      {layout === 'wide' ? <span className="rl-name">{subject}</span> : null}
                      <span className="rl-st"><Status s="sent" /></span>
                    </div>
                  ))}
                </div>
              </div>
            </Window>

            <Window chrome="terminal" title="northwind-api" className="rl-term rlh-term" data-show={term || undefined}>
              <div data-typing>
                {typedLines.map((l, i) => (
                  <div key={i}>{i === 0 ? '$ ' : ''}{l || ' '}</div>
                ))}
                {s.typed.length < CMD.length ? null : (
                  <div className="ok rlh-resp" data-show={s.resp || undefined}>
                    {'202 {"messageId":"msg_5NCf…",\n     "status":"queued"}'}
                  </div>
                )}
              </div>
            </Window>

            <div className="rl-card rlh-card" data-show={s.sel || undefined}>
              <div className="rl-h">Timeline</div>
              <ul className="rl-tl">
                {TL.map(([label, at], i) => (
                  <li key={label}>
                    <Collapse open={s.tl > i}>
                      <div className="rlh-tl-row">
                        <span>{label}</span>
                        <time>{at}</time>
                      </div>
                    </Collapse>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )
      }}
    </RStage>
  )
}


/** The poster renders with the page; the story loads once the browser is idle, and not at all under reduced motion. */
export function Hero() {
  const [script, setScript] = useState<Script>()
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const load = () => void import('./hero-script').then((m) => setScript(() => m.script))
    // Safari has no requestIdleCallback
    const idle = 'requestIdleCallback' in window
    const id = idle ? window.requestIdleCallback(load, { timeout: 2500 }) : window.setTimeout(load, 1200)
    return () => (idle ? window.cancelIdleCallback(id) : window.clearTimeout(id))
  }, [])
  return <HeroStage script={script} />
}
