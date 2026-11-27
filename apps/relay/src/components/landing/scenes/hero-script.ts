import { Act } from '../stageshow/act'
import { CMD, REST, type S } from './hero'

let first = true

export async function script(a: Act<S>) {
  // The poster is on screen when the script arrives and when each loop ends: hold it (longer the first time, so it can be read), then take it apart in view.
  await a.wait(first ? 6000 : 1800)
  first = false
  await a.set({ sel: false, tl: 0 })
  await a.wait(500)
  await a.set({ row: false, term: false })
  await a.wait(600)
  await a.snap({ typed: '', resp: false, stat: 'queued' })
  await a.wait(300)

  await a.set({ term: true })
  await a.wait(500)
  a.mark('request')
  await a.type('typed', CMD, { interval: 22 })
  await a.wait(300)
  await a.set({ resp: true })
  await a.wait(1100)

  a.mark('lands')
  await a.set({ row: true })
  await a.wait(1300)
  a.mark('sent')
  await a.set({ stat: 'sent' })
  await a.wait(1100)

  a.mark('open')
  await a.move('row-new')
  await a.wait(250)
  await a.click()
  await a.set({ sel: true })
  for (let i = 1; i <= 3; i++) {
    await a.wait(380)
    await a.set({ tl: i })
  }
  await a.wait(1200)
  await a.move(REST[a.layout])
  await a.wait(600)
}
