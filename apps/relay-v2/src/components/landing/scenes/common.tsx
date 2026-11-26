import { Children, useEffect, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { ChevronRight, Globe, LayoutDashboard, List, Mail, Megaphone, Settings, AppWindow } from 'lucide-react'
import { Badge } from '../stageshow/controls/Badge'
import { Button } from '../stageshow/controls/Button'
import { Field } from '../stageshow/controls/Field'
import { Stage } from '../stageshow/stage'
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
  suppressed: ['neutral', 'Suppressed'],
  verified: ['success', 'Verified'],
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

// The console's own sidebar (shell/nav.ts): the top-level items, with the active item's children open.
const NAV = [
  [LayoutDashboard, 'Overview', []],
  [Mail, 'Messages', ['Sent', 'Received', 'Failed to receive', 'Suppressions']],
  [Megaphone, 'Campaigns', ['Campaigns', 'Templates', 'Automations']],
  [List, 'Lists', []],
  null,
  [AppWindow, 'Apps', []],
  [Globe, 'Domains', []],
  [Settings, 'Settings', ['General', 'Members', 'Invites', 'Teams']],
] as const

export function Side({ on, child }: { on: string; child?: string }) {
  return (
    <aside className="rl-side">
      {NAV.map((n, i) => {
        if (!n) return <div key={i} className="rl-nav-gap" />
        const NavIcon = n[0]
        const open = n[1] === on
        return (
          <div key={n[1]} style={{ display: 'contents' }}>
            <div className="rl-nav" data-on={(open && !child) || undefined}>
              <NavIcon size={15} strokeWidth={1.75} />
              {n[1]}
            </div>
            {open && child ? n[2].map((c) => (
              <div key={c} className="rl-nav rl-sub" data-on={c === child || undefined} data-target={`nav-${c}`}>{c}</div>
            )) : null}
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

/** Panes side by side; the one at `at` slides in and the rest slide out. Panes move, never crossfade. */
export function Track({ at, children }: { at: number; children: ReactNode }) {
  return (
    <div className="rl-viewport">
      <div className="rl-track" style={{ ['--at' as string]: at } as CSSProperties}>
        {Children.toArray(children).map((c, i) => (
          <div key={i} className="rl-slot" data-on={i === at || undefined}>
            {c}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The Messages table's own columns: When, From / To, Subject, Status. The phone design drops When. */
export function MsgHead({ wide }: { wide: boolean }) {
  return (
    <div className="rl-grid" data-head>
      {wide ? <span>When</span> : null}
      <span>From / To</span>
      <span>Subject</span>
      <span>Status</span>
    </div>
  )
}

export function MsgRow({ wide, when, who, subject, status, hot, ...rest }: { wide: boolean; when: string; who: string; subject: string; status: ReactNode; hot?: boolean } & Record<`data-${string}`, unknown>) {
  return (
    <div className="rl-grid" data-sel={hot || undefined} {...rest}>
      {wide ? <span className="rl-mute">{when}</span> : null}
      <span>{who}</span>
      <span className="rl-name">{subject}</span>
      <span className="rl-st">{status}</span>
    </div>
  )
}

export function MsgTools() {
  return (
    <div className="rl-tools">
      <Field value="" placeholder="From or to address" />
      <Button>Status</Button>
    </div>
  )
}
