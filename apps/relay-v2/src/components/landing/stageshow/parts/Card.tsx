import type { CSSProperties, HTMLAttributes } from 'react'
import './Card.css'

/**
 * A surface that holds content: a comment, a receipt, a settings group.
 * Its padding is one value on every side, so it can never come out uneven,
 * and its children are spaced by `gap`, never by their own margins (the
 * first and last child's margins are dropped, so nothing pads the bottom
 * twice). A rounded box inside it takes `var(--ss-card-inner)` as its radius:
 * the card's radius less its padding, so the two curves stay parallel.
 */
export function Card({ pad = 'medium', gap = 12, tone = 'surface', className, style, ...rest }: HTMLAttributes<HTMLDivElement> & {
  /** small 12px, medium 16px (the default), on every side. */
  pad?: 'small' | 'medium'
  /** Space between children, in px. */
  gap?: number
  /** surface: white with a hairline ring. sunken: a quiet gray fill, no ring, for a group inside a surface. */
  tone?: 'surface' | 'sunken'
}) {
  return (
    <div
      {...rest}
      className={`ss-card${className ? ` ${className}` : ''}`}
      data-pad={pad}
      data-tone={tone}
      style={{ ...style, '--ss-card-gap': `${gap}px` } as CSSProperties}
    />
  )
}
