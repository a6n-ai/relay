import { useEffect, useState, type ComponentProps } from 'react'
import { ChevronRight } from 'lucide-react'
import { Badge } from '../stageshow/controls/Badge'
import { Stage } from '../stageshow/stage'
import { STATUS } from '../../page/status-badge'
import { visibleNav } from '../../shell/nav'
import { usePageOf } from '../../shell/page-data'
import './relay.css'

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning'

/** The console's own StatusBadge labels and tones; the landing badge calls the console "info" tone "accent". */
export function Status({ s }: { s: string }) {
  if (s === 'received') return <Badge tone="success">Received</Badge>
  const { tone, label } = STATUS[s as keyof typeof STATUS] ?? STATUS.draft
  return <Badge tone={(tone === 'info' ? 'accent' : tone) as Tone}>{label}</Badge>
}

/** Follows the page theme: `.dark` on <html>. Light until the page says otherwise. */
function useRelayTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const root = document.documentElement
    const read = () => setTheme(root.classList.contains('dark') ? 'dark' : 'light')
    read()
    const mo = new MutationObserver(read)
    mo.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return theme
}

type StageProps<S extends object> = ComponentProps<typeof Stage<S>>

export function RStage<S extends object>({ className, ...props }: StageProps<S>) {
  const theme = useRelayTheme()
  return <Stage<S> theme={theme} fidelity="standard" {...props} className={`rl ${className ?? ''}`} />
}

// The console's own sidebar: the owner's work and setup groups from shell/nav.ts, labelled by the routes' titles, with the active item's children open.
export function Side({ on, child }: { on: string; child?: string }) {
  const groups = visibleNav(['owner'], false, true, usePageOf()).filter((g) => g.id !== 'platform')
  return (
    <aside className="rl-side">
      {groups.map((g, gi) => (
        <div key={g.id} style={{ display: 'contents' }}>
          {gi > 0 ? <div className="rl-nav-gap" /> : null}
          {g.items.map((n) => {
            const NavIcon = n.icon
            const open = n.id === on
            return (
              <div key={n.id} style={{ display: 'contents' }}>
                <div className="rl-nav" data-on={(open && !child) || undefined}>
                  <NavIcon size={15} strokeWidth={1.75} />
                  {n.label}
                </div>
                {open && child ? n.children?.map((c) => (
                  <div key={c.id} className="rl-nav rl-sub" data-on={c.id === child || undefined} data-target={`nav-${c.label}`}>{c.label}</div>
                )) : null}
              </div>
            )
          })}
        </div>
      ))}
    </aside>
  )
}

export function Crumbs({ items }: { items: string[] }) {
  return (
    <div className="rl-head">
      {items.map((c, i) => (
        <span key={c} style={{ display: 'contents' }}>
          {i > 0 ? <ChevronRight size={14} strokeWidth={1.75} /> : null}
          {i === items.length - 1 ? <b>{c}</b> : c}
        </span>
      ))}
    </div>
  )
}
