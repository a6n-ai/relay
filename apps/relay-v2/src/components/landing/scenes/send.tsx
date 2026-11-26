import { Collapse } from '../stageshow/motion/Collapse'
import { Segmented } from '../stageshow/controls/Segmented'
import { States } from '../stageshow/motion/States'
import { Window } from '../stageshow/window'
import { type Act } from '../stageshow/act'
import { Crumbs, MsgHead, MsgRow, MsgTools, RStage, Side, Status, Track } from './common'
import './send.css'

// Send: the Messages list. A message lands in Sent as Queued and moves to Sent;
// the Received tab then gains a letter, marked Received.

type S = { tab: 0 | 1; a: boolean; st: 'queued' | 'sent'; b: boolean }
const initial: S = { tab: 0, a: false, st: 'queued', b: false }
const POSTER: S = { tab: 1, a: true, st: 'sent', b: true }
const REST = { wide: { x: 360, y: 330 }, compact: { x: 280, y: 250 } }

const SENT = [
  ['2 min ago', 'grace@example.com', 'Your receipt', 'sent'],
  ['14 min ago', 'linus@example.com', 'Sign-in code', 'failed'],
  ['1 hour ago', 'marie@example.com', 'Order shipped', 'sent'],
  ['3 hours ago', 'alan@example.com', 'Invoice ready', 'sent'],
  ['Yesterday', 'ben@example.com', 'Verify email', 'sent'],
] as const
const GOT = [
  ['9 min ago', 'grace@example.com', 'Question'],
  ['1 hour ago', 'linus@example.com', 'Order 1042'],
  ['3 hours ago', 'marie@example.com', 'Billing'],
  ['Yesterday', 'alan@example.com', 'Re: Receipt'],
  ['Yesterday', 'ben@example.com', 'Re: Verify'],
] as const

async function script(a: Act<S>) {
  const wide = a.layout === 'wide'
  await a.wait(900)
  a.mark('queued')
  await a.set({ a: true })
  await a.wait(1300)
  a.mark('sent')
  await a.set({ st: 'sent' })
  await a.wait(1400)

  a.mark('received')
  if (wide) {
    await a.move('nav-Received')
    await a.wait(250)
    await a.click()
  }
  await a.set({ tab: 1 })
  await a.wait(900)
  await a.set({ b: true })
  await a.wait(3000)

  if (wide) {
    await a.move('nav-Sent')
    await a.wait(250)
    await a.click()
  }
  await a.set({ tab: 0 })
  await a.wait(500)
  await a.set({ a: false, b: false })
  await a.move(REST[a.layout])
  await a.wait(700)
  await a.snap({ st: 'queued' })
  await a.wait(300)
}

export function SendStage({ animate = true }: { animate?: boolean }) {
  return (
    <RStage<S>
      width={600}
      height={420}
      compact={{ below: 520, width: 358, height: 340 }}
      initial={initial}
      poster={POSTER}
      script={animate ? script : undefined}
      cursor={{ at: REST }}
      fill
      className="rls"
    >
      {(s, _r, layout) => {
        const wide = layout === 'wide'
        return (
          <Window url="relay.a6n.ai/messages" className="rl-win">
            <div className="rl-app rl-wide rl-msg">
              {wide ? <Side on="Messages" child={s.tab ? 'Received' : 'Sent'} /> : null}
              <div className="rl-main">
                {wide ? null : (
                  <div className="rls-seg">
                    <Segmented items={['Sent', 'Received']} value={s.tab} />
                  </div>
                )}
                <Track at={s.tab}>
                  <div className="rl-pane">
                    <Crumbs items={['Messages', 'Sent']} />
                    <MsgTools />
                    <MsgHead wide={wide} />
                    <Collapse open={s.a} reveal="drop">
                      <MsgRow wide={wide} when="Just now" who="ada@example.com" subject="Welcome" hot
                        status={<States value={s.st} align="start" states={{ queued: <Status s="queued" />, sent: <Status s="sent" /> }} />} />
                    </Collapse>
                    {SENT.map(([when, who, subject, st]) => (
                      <MsgRow key={who} wide={wide} when={when} who={who} subject={subject} status={<Status s={st} />} />
                    ))}
                  </div>
                  <div className="rl-pane">
                    <Crumbs items={['Messages', 'Received']} />
                    <MsgTools />
                    <MsgHead wide={wide} />
                    <Collapse open={s.b} reveal="drop">
                      <MsgRow wide={wide} when="Just now" who="ada@example.com" subject="Re: Welcome" hot status={<Status s="received" />} />
                    </Collapse>
                    {GOT.map(([when, who, subject]) => (
                      <MsgRow key={who} wide={wide} when={when} who={who} subject={subject} status={<Status s="received" />} />
                    ))}
                  </div>
                </Track>
              </div>
            </div>
          </Window>
        )
      }}
    </RStage>
  )
}

export default SendStage
