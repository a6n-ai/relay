import type { Act } from '../stageshow'
import { CMD, REST, type S } from './hero'

export async function script(a: Act<S>) {
  await a.wait(500)
  await a.set({ term: true })
  await a.wait(500)
  a.mark('request')
  await a.type('typed', CMD, { interval: 22 })
  await a.wait(300)
  await a.set({ resp: true })
  await a.wait(1100)

  a.mark('lands')
  await a.set((s) => ({ row: true, term: a.layout === 'wide' ? s.term : false }))
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
  await a.wait(3200)

  await a.set({ sel: false, tl: 0 })
  await a.wait(500)
  await a.set({ row: false, term: false })
  await a.move(REST[a.layout])
  await a.wait(700)
  await a.snap({ typed: '', resp: false, stat: 'queued' })
  await a.wait(300)
}

