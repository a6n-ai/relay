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
