import { ArrowRight } from 'lucide-react'
import { Collapse } from '../stageshow/motion/Collapse'
import { Window } from '../stageshow/window'
import { type Act } from '../stageshow/act'
import { Crumbs, MsgHead, MsgRow, MsgTools, RStage, Side, Status } from './common'
import './inbound.css'

// Inbound: a letter arrives and lands at the top of Messages > Received, then
// Relay posts it to the webhook (mailbox.received).

type S = { row: boolean; hook: boolean }
const initial: S = { row: false, hook: false }
const POSTER: S = { row: true, hook: true }

const ROWS = [
  ['9 min ago', 'grace@example.com', 'Question'],
  ['1 hour ago', 'linus@example.com', 'Order 1042'],
  ['3 hours ago', 'marie@example.com', 'Billing'],
  ['Yesterday', 'alan@example.com', 'Re: Receipt'],
  ['Yesterday', 'ben@example.com', 'Re: Verify'],
] as const

async function script(a: Act<S>) {
  await a.wait(1000)
  a.mark('arrives')
  await a.set({ row: true })
  await a.wait(1800)
  a.mark('posted')
  await a.set({ hook: true })
  await a.wait(3800)
  await a.set({ hook: false })
  await a.wait(500)
  await a.set({ row: false })
  await a.wait(800)
}

export function InboundStage({ animate = true }: { animate?: boolean }) {
  return (
    <RStage<S> width={600} height={420} compact={{ below: 520, width: 358, height: 340 }} initial={initial} poster={POSTER} script={animate ? script : undefined} fill
      className="rli">
      {(s, _r, layout) => {
        const wide = layout === 'wide'
        return (
          <>
            <Window url="relay.a6n.ai/messages" className="rl-win">
              <div className="rl-app rl-wide rl-msg">
                {wide ? <Side on="Messages" child="Received" /> : null}
                <div className="rl-main">
                  <Crumbs items={['Messages', 'Received']} />
                  <MsgTools />
                  <MsgHead wide={wide} />
                  <Collapse open={s.row} reveal="drop">
                    <MsgRow wide={wide} when="Just now" who="ada@example.com" subject="Re: Welcome" hot status={<Status s="received" />} />
                  </Collapse>
                  {ROWS.map(([when, who, subject]) => (
                    <MsgRow key={who} wide={wide} when={when} who={who} subject={subject} status={<Status s="received" />} />
                  ))}
                </div>
              </div>
            </Window>
            <div className="rl-card rl-pop rli-hook" data-show={s.hook || undefined}>
              <ArrowRight size={16} strokeWidth={1.75} />
              <span className="rli-hook-text">
                <span className="rl-mono">mailbox.received</span>
                <span className="rl-mute">posted to your webhook</span>
              </span>
            </div>
          </>
        )
      }}
    </RStage>
  )
}

export default InboundStage
