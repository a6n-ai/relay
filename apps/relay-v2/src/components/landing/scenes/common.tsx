import { useEffect, useState, type ComponentProps } from 'react'
import { ChevronRight, Globe, LayoutDashboard, List, Mail, Megaphone, Settings, AppWindow } from 'lucide-react'
import { Badge, Stage } from '../stageshow'
import './relay.css'

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning'

const STATUS: Record<string, [Tone, string]> = {
  queued: ['accent', 'Queued'],
  sent: ['success', 'Sent'],
  scheduled: ['accent', 'Scheduled'],
  draft: ['neutral', 'Draft'],
  pending: ['warning', 'Pending'],
  failed: ['danger', 'Failed'],
  subscribed: ['success', 'Subscribed'],
  received: ['success', 'Received'],
}

/** The console's own StatusBadge labels and tones. */
export function Status({ s }: { s: keyof typeof STATUS | string }) {
  const [tone, label] = STATUS[s] ?? STATUS.draft
  return <Badge tone={tone}>{label}</Badge>
}

/** Follows the page theme: `.dark` on <html>. Light until the page says otherwise. */
export function useRelayTheme(): 'light' | 'dark' {
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

const NAV = [
  [LayoutDashboard, 'Overview'],
  [Mail, 'Messages'],
  [Megaphone, 'Campaigns'],
  [List, 'Lists'],
  null,
  [AppWindow, 'Apps'],
  [Globe, 'Domains'],
  [Settings, 'Settings'],
] as const

export function Side({ on }: { on: string }) {
  return (
    <aside className="rl-side">
      {NAV.map((n, i) => {
        if (!n) return <div key={i} className="rl-nav-gap" />
        const NavIcon = n[0]
        return (
          <div key={n[1]} className="rl-nav" data-on={n[1] === on || undefined}>
            <NavIcon size={15} strokeWidth={1.75} />
            {n[1]}
          </div>
        )
      })}
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
