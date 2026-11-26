import { Bar, Button, Card, Count, Field, Meter, Segmented, Window, type Act } from '../stageshow'
import { Crumbs, RStage } from './common'
import './campaigns.css'

// Campaigns: a draft is scheduled from its page. Schedule opens the dialog,
// Send now confirms, the page becomes the report: scheduled, then sending with
// the recipient count rolling up and the meter filling.

type S = { dlg: boolean; ph: 0 | 1 | 2; n: number; sent: number; d: number; o: number; c: number }
const initial: S = { dlg: false, ph: 0, n: 0, sent: 0, d: 0, o: 0, c: 0 }
const POSTER: S = { dlg: false, ph: 2, n: 1284, sent: 680, d: 652, o: 214, c: 61 }
const REST = { wide: { x: 400, y: 250 }, compact: { x: 280, y: 250 } }
const TOTAL = 1284

const num = (n: number) => Math.round(n).toLocaleString('en-US')

async function script(a: Act<S>) {
  await a.wait(900)
  a.mark('open')
  await a.move('schedule')
  await a.wait(250)
  await a.click()
  await a.set({ dlg: true })
  await a.wait(1000)
  a.mark('confirm')
  await a.move('send-now')
  await a.wait(300)
  await a.click()
  await a.set({ dlg: false })
  await a.wait(250)
  await a.set({ ph: 1 })
  await a.wait(1500)
  a.mark('sending')
  await a.set({ ph: 2, n: TOTAL })
  await a.wait(900)
  await a.set({ sent: 680, d: 652 })
  await a.wait(700)
  await a.set({ o: 214, c: 61 })
  await a.wait(3000)
  await a.set({ ph: 0, dlg: false })
  await a.move(REST[a.layout])
  await a.wait(600)
  await a.snap({ n: 0, sent: 0, d: 0, o: 0, c: 0 })
  await a.wait(300)
}

export function CampaignsStage({ animate = true }: { animate?: boolean }) {
  return (
    <RStage<S>
      width={520}
      height={340}
      compact={{ below: 520, width: 358, height: 340 }}
      initial={initial}
      poster={POSTER}
      script={animate ? script : undefined}
      cursor={{ at: REST }}
      fill
      className="rlc"
    >
      {(s, _r, layout) => {
        const wide = layout === 'wide'
        return (
          <>
            <Window url="relay.a6n.ai/campaigns" className="rlc-win">
              <div className="rl-app rlc-app">
                <div className="rl-main">
                  <Crumbs items={['Campaigns', 'Spring launch']} />
                  <div className="rlc-tools">
                    <div className="rl-stack">
                      <div className="rl-bar" data-on={s.ph === 0 || undefined}>
                        {wide ? <Button>Save</Button> : null}
                        <Button>Send test to me</Button>
                        <Button variant="primary" data-target="schedule">Schedule…</Button>
                      </div>
                      <div className="rl-bar" data-on={s.ph === 1 || undefined}>
                        <Button>Unschedule</Button>
                      </div>
                      <div className="rl-bar" data-on={s.ph === 2 || undefined}>
                        <Button>Pause</Button>
                        <Button>Cancel campaign</Button>
                      </div>
                    </div>
                  </div>
                  <div className="rlc-body">
                    <div className="rl-stack">
                      <div className="rl-pad" data-on={s.ph === 0 || undefined}>
                        <Field label="From" value="hello@mail.acme.test" />
                        <Field label="Subject" value="Our spring launch is here" />
                        <Card pad="small" gap={8} tone="sunken">
                          <Bar w={220} h={7} tone={3} />
                          <Bar w={160} h={7} tone={2} />
                          <Bar w={190} h={7} tone={2} />
                        </Card>
                      </div>
                      <div className="rl-pad" data-on={s.ph !== 0 || undefined}>
                        <div className="rl-hint">{s.ph === 1 ? 'Scheduled just now' : 'Scheduled just now · Started just now'}</div>
                        <div className="rlc-meter">
                          <Meter value={s.n / TOTAL} tone="ink" />
                          <span className="rl-hint">{num(s.n)} of {num(TOTAL)}</span>
                        </div>
                        <div className="rl-tiles">
                          {[
                            ['Recipients', s.n],
                            ['Waiting', s.n - s.sent],
                            ['Sent', s.sent],
                            ['Delivered', s.d],
                            ['Opened', s.o],
                            ['Clicked', s.c],
                          ].map(([label, v]) => (
                            <Card key={label} pad="small" gap={4} tone="sunken">
                              <div className="rl-tile"><span>{label}</span><b><Count value={v as number} duration={900} /></b></div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Window>

            <div className="rl-card rl-pop rlc-dlg" data-show={s.dlg || undefined}>
              <div className="rl-h">Schedule campaign</div>
              <Segmented items={['Send now', 'Schedule for later']} value={0} />
              <div className="rlc-dlg-act">
                <Button variant="primary" data-target="send-now">Send now</Button>
              </div>
            </div>
          </>
        )
      }}
    </RStage>
  )
}

export default CampaignsStage
