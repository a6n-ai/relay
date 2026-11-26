import { Clock } from 'lucide-react'
import { Roll } from '../stageshow/motion/Roll'
import { States } from '../stageshow/motion/States'
import { Window } from '../stageshow/window'
import { type Act } from '../stageshow/act'
import { Crumbs, RStage, Status } from './common'
import './webhooks.css'

// Webhooks: a mailbox.received delivery fails once (HTTP 503), Relay retries
// after one minute, and the same row ends Sent: 2 attempts, response 200.
// No cursor: the table is the story.

type S = { row: boolean; chip: boolean; ok: boolean }
const initial: S = { row: false, chip: false, ok: false }
const POSTER: S = { row: true, chip: true, ok: true }

const OLD = [
  ['2 hours ago', 1, 200],
  ['yesterday', 1, 200],
] as const
// Filler rows under the fade, drawn as placeholder bars.
const GHOSTS = [0, 1, 2]

async function script(a: Act<S>) {
  await a.wait(900)
  a.mark('fails')
  await a.set({ row: true })
  await a.wait(2200)
  a.mark('wait')
  await a.set({ chip: true })
  await a.wait(1800)
  a.mark('retry')
  await a.set({ ok: true })
  await a.wait(3600)
  await a.set({ chip: false })
  await a.wait(500)
  await a.set({ row: false })
  await a.wait(700)
  await a.snap({ ok: false })
  await a.wait(300)
}

export function WebhooksStage({ animate = true }: { animate?: boolean }) {
  return (
    <RStage<S>
      width={520}
      height={340}
      compact={{ below: 520, width: 358, height: 340 }}
      initial={initial}
      poster={POSTER}
      script={animate ? script : undefined}
      fill
      className="rlw"
    >
      {(s, _r, layout) => {
        const wide = layout === 'wide'
        const cols = wide ? '88px 78px 62px 66px minmax(0, 1fr)' : '72px 70px 58px minmax(0, 1fr)'
        const st = { ['--cols' as string]: cols }
        return (
          <>
            <Window url="relay.a6n.ai/apps/webhooks" className="rlw-win">
              <div className="rl-app rlw-app">
                <div className="rl-main">
                  <Crumbs items={wide ? ['Northwind', 'Webhooks', 'hooks.northwind.test'] : ['Webhooks', 'hooks.northwind.test']} />
                  <div className="rlw-url">
                    <b>Webhook</b>
                    <span className="rl-mono">{wide ? 'https://hooks.northwind.test/relay' : 'hooks.northwind.test/relay'}</span>
                  </div>
                  <div className="rl-grid" data-head style={st}>
                    <span>When</span>
                    <span>Status</span>
                    <span className="rl-num">Attempts</span>
                    <span className="rl-num">Response</span>
                    {wide ? <span>Last error</span> : null}
                  </div>
                  <div className="rlw-rows">
                    <div className="rl-grid rlw-new" style={st} data-show={s.row || undefined} data-wash={s.ok || undefined}>
                      <span className="rl-mute">Just now</span>
                      <span className="rl-st">
                        <States value={s.ok ? 'sent' : 'pending'} align="start" states={{ pending: <Status s="pending" />, sent: <Status s="sent" /> }} />
                      </span>
                      <span className="rl-num"><Roll>{s.ok ? '2' : '1'}</Roll></span>
                      <span className="rl-num"><Roll>{s.ok ? '200' : '503'}</Roll></span>
                      {wide ? <span className="rl-mute"><States value={s.ok ? 'ok' : 'err'} align="start" states={{ err: 'HTTP 503', ok: '—' }} /></span> : null}
                    </div>
                    <div className="rlw-old" data-shifted={s.row || undefined}>
                      {OLD.map(([when, n, code]) => (
                        <div key={when} className="rl-grid" style={st}>
                          <span className="rl-mute">{when}</span>
                          <span className="rl-st"><Status s="sent" /></span>
                          <span className="rl-num">{n}</span>
                          <span className="rl-num">{code}</span>
                          {wide ? <span className="rl-mute">—</span> : null}
                        </div>
                      ))}
                      {GHOSTS.map((g) => (
                        <div key={g} className="rl-grid" style={st} data-ghost aria-hidden="true">
                          <span />
                          <span />
                          <span />
                          <span />
                          {wide ? <span /> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Window>
            <div className="rl-card rl-pop rlw-chip" data-show={s.chip || undefined}>
              <Clock size={16} strokeWidth={1.75} />
              1 minute later
            </div>
          </>
        )
      }}
    </RStage>
  )
}

export default WebhooksStage
