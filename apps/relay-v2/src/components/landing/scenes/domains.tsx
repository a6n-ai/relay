import { Check, Ellipsis } from 'lucide-react'
import { Button, Collapse, Field, Menu, States, Toast, Window, type Act } from '../stageshow'
import { Crumbs, RStage, Side, Status } from './common'
import './domains.css'

// Console: Domains. A new domain is Pending; its DNS records are opened, then
// Check now moves it to Verified.

type S = { row: boolean; open: boolean; menu: boolean; ok: boolean; toast: boolean }
const initial: S = { row: false, open: false, menu: false, ok: false, toast: false }
const POSTER: S = { row: true, open: true, menu: false, ok: true, toast: true }
const REST = { wide: { x: 330, y: 380 }, compact: { x: 260, y: 380 } }

const RECORDS = [
  ['k1._domainkey.mail.acme.test', 'k1.dkim.example.com'],
  ['k2._domainkey.mail.acme.test', 'k2.dkim.example.com'],
  ['k3._domainkey.mail.acme.test', 'k3.dkim.example.com'],
] as const

async function script(a: Act<S>) {
  await a.wait(800)
  a.mark('added')
  await a.set({ row: true })
  await a.wait(1100)
  a.mark('records')
  await a.move('dns')
  await a.wait(250)
  await a.click()
  await a.set({ open: true })
  await a.wait(1600)
  a.mark('check')
  await a.move('more')
  await a.wait(250)
  await a.click()
  await a.set({ menu: true })
  await a.wait(500)
  await a.move('check-now')
  await a.wait(250)
  await a.click()
  await a.set({ menu: false })
  await a.wait(300)
  await a.set({ ok: true, toast: true })
  await a.wait(3000)
  await a.set({ toast: false })
  await a.wait(300)
  await a.set({ open: false })
  await a.wait(500)
  await a.set({ row: false })
  await a.move(REST[a.layout])
  await a.wait(700)
  await a.snap({ ok: false })
  await a.wait(300)
}

export function DomainsStage({ animate = true }: { animate?: boolean }) {
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
      className="rld"
    >
      {(s, _r, layout) => {
        const wide = layout === 'wide'
        const dns = (
          <Button variant="ghost" data-target="dns">DNS records (3)</Button>
        )
        return (
          <>
            <Window url="relay.a6n.ai/domains" className="rl-win">
              <div className="rl-app rl-wide rl-dom">
                {wide ? <Side on="Domains" /> : null}
                <div className="rl-main">
                  <Crumbs items={['Domains']} />
                  <div className="rl-tools">
                    <Field value="" placeholder="Search domains" />
                    <Button>Status</Button>
                    <Button variant="primary">Add domain</Button>
                  </div>
                  <div className="rl-grid" data-head>
                    <span>Domain</span>
                    <span>Status</span>
                    {wide ? <span>DNS</span> : null}
                    <span />
                  </div>
                  <Collapse open={s.row} reveal="drop">
                    <div className="rl-grid" data-sel>
                      <span className="rl-mono">mail.acme.test</span>
                      <span className="rl-st">
                        <States value={s.ok ? 'verified' : 'pending'} align="start" states={{ pending: <Status s="pending" />, verified: <Status s="verified" /> }} />
                      </span>
                      {wide ? <span>{dns}</span> : null}
                      <span className="rld-more" data-target="more"><Ellipsis size={16} strokeWidth={1.75} /></span>
                    </div>
                    {wide ? null : <div className="rld-dnsrow">{dns}</div>}
                    <Collapse open={s.open}>
                      <ul className="rld-recs">
                        {RECORDS.map(([name, value]) => (
                          <li key={name}>
                            <span className="rl-mono">{name}</span>
                            <span className="rl-mute">CNAME to <span className="rl-mono">{value}</span></span>
                          </li>
                        ))}
                      </ul>
                    </Collapse>
                  </Collapse>
                  {['example.com', 'shop.acme.test'].map((d) => (
                    <div key={d} className="rl-grid">
                      <span className="rl-mono">{d}</span>
                      <span className="rl-st"><Status s="verified" /></span>
                      {wide ? <span><Button variant="ghost">DNS records (3)</Button></span> : null}
                      <span className="rld-more"><Ellipsis size={16} strokeWidth={1.75} /></span>
                    </div>
                  ))}
                </div>
              </div>
            </Window>
            <div className="rl-card rl-pop rld-menu" data-show={s.menu || undefined}>
              <Menu items={['Check now']} targets={['check-now']} />
            </div>
            <Toast show={s.toast} icon={<Check size={14} strokeWidth={2} />} className="rld-toast">Domain verified</Toast>
          </>
        )
      }}
    </RStage>
  )
}

export default DomainsStage
