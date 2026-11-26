import type { HTMLAttributes, ReactNode } from 'react'
import './window.css'

export interface WindowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Browser: the address. */
  url?: ReactNode
  /** Terminal: the dim, centered title. */
  title?: string
  /** Props for the content column (data-crop, a class), which sits inside the window's own clip. */
  body?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, unknown>
  /** Fades the window to 40%, so a window in front of it reads as the subject. */
  receded?: boolean
  /** `native` is macOS (the default). `terminal` is a dark terminal: one surface, no rule under the bar. */
  chrome?: 'native' | 'terminal'
  children?: ReactNode
}

/** The traffic lights, centered in the top 38px, 12px in. */
function Lights() {
  return (
    <span className="ss-window__lights">
      <span className="ss-window__dot" />
      <span className="ss-window__dot" />
      <span className="ss-window__dot" />
    </span>
  )
}

/** Window chrome: a browser (`url`) or a terminal. */
export function Window({ url, title, body, className, receded, chrome, children, ...rest }: WindowProps) {
  const cls = `ss-window ss-recede${className ? ` ${className}` : ''}`
  const terminal = chrome === 'terminal'
  return (
    <div {...rest} className={cls} data-chrome={terminal ? 'terminal' : undefined} data-receded={receded || undefined}>
      <div className="ss-window__bar">
        <Lights />
        {terminal ? title !== undefined && <span className="ss-term__title">{title}</span> : url !== undefined && <span className="ss-window__url">{url}</span>}
      </div>
      <div {...body} className={`ss-window__body${terminal ? ' ss-term' : ''}${body?.className ? ` ${body.className}` : ''}`}>{children}</div>
    </div>
  )
}

const INK = ['var(--ss-ink-1)', 'var(--ss-ink-2)', 'var(--ss-ink-3)', 'var(--ss-ink-4)', 'var(--ss-ink-5)']

export interface BarProps extends HTMLAttributes<HTMLSpanElement> {
  w: number | string
  h?: number
  /** 1 (faintest) to 5 */
  tone?: 1 | 2 | 3 | 4 | 5
  r?: number
  /** Let it narrow in a row too tight for it, never past its container. On
   * by default for a line (a numeric `w` over three times `h`); an icon slot,
   * a dot or a percentage width keeps its size. */
  shrink?: boolean
}

/** A placeholder: a line of text, a value, an icon slot or a pill. A line
 * gives way in a narrow row as text would; where it fits, it is exactly `w`. */
export function Bar({ w, h = 6, tone = 3, r = 2, shrink, className, style, ...rest }: BarProps) {
  const gives = shrink ?? (typeof w === 'number' && w > h * 3)
  return <span {...rest} className={`ss-bar${className ? ` ${className}` : ''}`} data-shrink={gives || undefined} style={{ width: w, height: h, borderRadius: r, background: INK[tone - 1], ...style }} />
}
