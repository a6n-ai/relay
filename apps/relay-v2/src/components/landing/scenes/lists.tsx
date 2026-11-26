import { Button, Collapse, States, Window, type Act, type Point } from '../stageshow'
import { File as FileIcon } from 'lucide-react'
import { Crumbs, RStage, Status } from './common'
import './lists.css'

// Lists: a CSV is dragged onto the import dialog, Import contacts runs, the
// dialog reports Added 3, Suppressed 1, and the new contacts appear on the list.

type G = { on: boolean; x: number; y: number; bx: number; by: number }
type S = { dlg: boolean; g: G; file: boolean; busy: boolean; res: boolean; rows: number }
const initial: S = { dlg: false, g: { on: false, x: 0, y: 0, bx: 0, by: 0 }, file: false, busy: false, res: false, rows: 0 }
const POSTER: S = { dlg: true, g: initial.g, file: true, busy: false, res: true, rows: 3 }

const OLD = [
  ['ada@example.com', 'Manual'],
  ['grace@example.com', 'Manual'],
] as const
const NEW = ['linus@example.com', 'marie@example.com', 'alan@example.com']
const REST = { wide: { x: 100, y: 345 }, compact: { x: 100, y: 345 } }

async function script(a: Act<S>) {
  await a.wait(800)
  a.mark('open')
  await a.move('import')
  await a.wait(250)
  await a.click()
  await a.set({ dlg: true })
  await a.wait(700)

  a.mark('drag')
  const f = a.rect('csv-src')
  const grab = { x: f.x + f.width / 2, y: f.y + f.height / 2 }
  await a.move(grab)
  await a.wait(200)
  const zone = a.rect('zone')
  await a.drag({ x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }, (at: Point) => a.put({ g: { on: true, x: at.x, y: at.y, bx: grab.x, by: grab.y } }), { duration: 1100 })
  a.mark('drop')
  await a.set((s) => ({ file: true, g: { ...s.g, on: false } }))
  await a.wait(700)

  a.mark('import')
  await a.move('go')
  await a.wait(250)
  await a.click()
  await a.set({ busy: true })
  await a.wait(1100)
  await a.set({ busy: false, res: true })
  await a.wait(300)
  await a.set({ rows: 3 })
  await a.wait(2600)

  await a.move('done')
  await a.wait(250)
  await a.click()
  await a.set({ dlg: false })
  await a.wait(2200)

  await a.set({ rows: 0 })
  await a.move(REST[a.layout])
  await a.wait(700)
  await a.snap({ file: false, res: false, busy: false, g: initial.g })
  await a.wait(300)
}

export function ListsStage({ animate = true }: { animate?: boolean }) {
  return (
    <RStage<S>
      width={520}
      height={380}
      compact={{ below: 520, width: 358, height: 340 }}
      initial={initial}
      poster={POSTER}
      script={animate ? script : undefined}
      cursor={{ at: REST }}
      fill
      className="rll"
    >
      {(s, _r, layout) => {
        const wide = layout === 'wide'
        return (
          <>
            <Window url="relay.a6n.ai/lists" className="rll-win">
              <div className="rl-app rll-app">
                <div className="rl-main">
                  <Crumbs items={['Lists', 'Newsletter']} />
                  <div className="rl-bar">
                    <Button>Add contact</Button>
                    <Button data-target="import">Import CSV</Button>
                  </div>
                  <div className="rl-grid" data-head style={{ ['--cols' as string]: wide ? '1fr 60px 84px' : '1fr 84px' }}>
                    <span>Email</span>
                    {wide ? <span>Source</span> : null}
                    <span>Status</span>
                  </div>
                  {OLD.map(([e, src]) => (
                    <div key={e} className="rl-grid" style={{ ['--cols' as string]: wide ? '1fr 60px 84px' : '1fr 84px' }}>
                      <span>{e}</span>
                      {wide ? <span className="rl-mute">{src}</span> : null}
                      <span className="rl-st"><Status s="subscribed" /></span>
                    </div>
                  ))}
                  {NEW.map((e, i) => (
                    <Collapse key={e} open={s.rows > i} reveal="drop">
                      <div className="rl-grid" style={{ ['--cols' as string]: wide ? '1fr 60px 84px' : '1fr 84px' }}>
                        <span>{e}</span>
                        {wide ? <span className="rl-mute">Import</span> : null}
                        <span className="rl-st"><Status s="subscribed" /></span>
                      </div>
                    </Collapse>
                  ))}
                </div>
              </div>
            </Window>

            <div className="rll-src" data-target="csv-src" data-on={(s.dlg && !s.file) || undefined} data-lifted={s.g.on || undefined} style={s.g.bx ? { transform: `translate(${s.g.x - s.g.bx}px, ${s.g.y - s.g.by}px)` } : undefined}>
              <FileIcon size={16} strokeWidth={1.75} />
              contacts.csv
            </div>

            <div className="rl-card rl-pop rll-dlg" data-show={s.dlg || undefined}>
              <div className="rl-h">Import contacts</div>
              <Collapse open={!s.res}>
                <div className="rll-form">
                  <div className="rll-zone" data-target="zone" data-hot={s.g.on || undefined}>
                    <States
                      value={s.file ? 'file' : 'empty'}
                      states={{
                        empty: <span>Drop a .csv file here, up to 2 MB</span>,
                        file: (
                          <span className="rll-chosen">
                            <FileIcon size={16} strokeWidth={1.75} />
                            contacts.csv
                          </span>
                        ),
                      }}
                    />
                  </div>
                  <p className="rl-hint">Columns: email, first_name, last_name, name, consent_at. The email column is required.</p>
                  <div className="rll-act">
                    <Button variant="ghost">Cancel</Button>
                    <Button variant="primary" data-target="go">
                      <States value={s.busy ? 'busy' : 'idle'} states={{ idle: 'Import contacts', busy: 'Importing…' }} />
                    </Button>
                  </div>
                </div>
              </Collapse>
              <Collapse open={s.res}>
                <div className="rll-form">
                  <p className="rll-res">
                    Added 3 · Already on list 0 · Suppressed 1 · Invalid 0 · Duplicates 0
                  </p>
                  <div className="rll-act">
                    <Button variant="primary" data-target="done">Done</Button>
                  </div>
                </div>
              </Collapse>
            </div>
          </>
        )
      }}
    </RStage>
  )
}

export default ListsStage
