import { ArrowRight, LayoutDashboard, List, Mail, Megaphone } from 'lucide-react'
import { Bar, Collapse, Window, type Act } from '../stageshow'
import { Crumbs, RStage, Status } from './common'
import './inbound.css'

// Inbound: a letter arrives and lands at the top of Messages > Received, then
// Relay posts it to the webhook (mailbox.received).

type S = { row: boolean; hook: boolean }
const initial: S = { row: false, hook: false }
const POSTER: S = { row: true, hook: true }

const SUB = ['Sent', 'Received', 'Failed to receive', 'Suppressions']
const ROWS = [
  ['grace@example.com', 'Question'],
  ['linus@example.com', 'Order 1042'],
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
    <RStage<S> width={520} height={340} compact={{ below: 520, width: 358, height: 340 }} initial={initial} poster={POSTER} script={animate ? script : undefined} fill
      className="rli">
      {(s, _r, layout) => {
        const wide = layout === 'wide'
        const st = { ['--cols' as string]: wide ? '118px 1fr 76px' : '1fr 88px' }
        return (
          <>
            <Window url="relay.a6n.ai/messages" className="rli-win">
              <div className="rl-app rli-app" style={{ ['--side' as string]: wide ? '136px' : '0px' }}>
                {wide ? (
                  <aside className="rl-side">
                    <div className="rl-nav"><LayoutDashboard size={15} strokeWidth={1.75} />Overview</div>
                    <div className="rl-nav"><Mail size={15} strokeWidth={1.75} />Messages</div>
                    {SUB.map((l) => (
                      <div key={l} className="rl-nav rli-sub" data-on={l === 'Received' || undefined}>{l}</div>
                    ))}
                    <div className="rl-nav"><Megaphone size={15} strokeWidth={1.75} />Campaigns</div>
                    <div className="rl-nav"><List size={15} strokeWidth={1.75} />Lists</div>
                  </aside>
                ) : null}
                <div className="rl-main">
                  <Crumbs items={['Messages', 'Received']} />
                  <div className="rl-grid" data-head style={st}>
                    <span>From</span>
                    {wide ? <span>Subject</span> : null}
                    <span>Status</span>
                  </div>
                  <Collapse open={s.row} reveal="drop">
                    <div className="rl-grid rli-new" style={st}>
                      <span>ada@example.com</span>
                      {wide ? <span className="rl-name">Re: Welcome</span> : null}
                      <span className="rl-st"><Status s="received" /></span>
                    </div>
                  </Collapse>
                  {ROWS.map(([from, subject]) => (
                    <div key={from} className="rl-grid" style={st}>
                      <span>{from}</span>
                      {wide ? <span className="rl-name">{subject}</span> : null}
                      <span className="rl-st"><Status s="received" /></span>
                    </div>
                  ))}
                  {[96, 74].map((w) => (
                    <div key={w} className="rl-grid" style={st}>
                      <Bar w={w} h={7} tone={3} />
                      {wide ? <Bar w={w - 20} h={7} tone={2} /> : null}
                      <span className="rl-st"><Status s="received" /></span>
                    </div>
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
