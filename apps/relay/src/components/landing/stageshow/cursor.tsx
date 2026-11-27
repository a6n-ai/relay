import type { Ref } from 'react'
import { MacPointer } from './cursors'
import type { Point } from './measure'
import './cursor.css'

// The cursor a stage draws: the glyph for each kind, where its hotspot sits,
// the five styles, and the ripple a click can send out.

/** Kinds the engine can switch to; only the pointer has a glyph, the one the landing scenes draw. */
export type CursorKind = 'pointer' | 'ibeam' | 'crosshair' | 'hand' | 'open' | 'grab' | 'wait' | 'resize-ns' | 'resize-ew' | 'resize-nwse' | 'resize-nesw'
/**
 * real: the macOS pointer. large: the same, 1.5x, for sites whose demos run
 * small. circle: the iPad's glass pointer, always showing. touch: a finger on
 * a phone, shown only where it touches (a soft dot that lands on press,
 * stays while a drag is held, and fades), invisible between taps. arrow: a
 * solid, rounded arrowhead, as illustrated product demos draw the pointer; it
 * stays an arrow over links and while dragging, and turns to an I-beam only
 * over text.
 */
export type CursorStyle = 'real' | 'large' | 'circle' | 'touch' | 'arrow'

// Where the glyph's hotspot sits inside its box, so the point is the click.
const POINTER_HOTSPOT: Point = { x: 7.5, y: 5.25 }

// The arrow style's pointer: one solid, rounded arrowhead, tip at the hotspot
const ARROW_HOTSPOT: Point = { x: 4, y: 3 }
function SolidArrow() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="ss-cursor__arrow" aria-hidden>
      <path d="M4 3 18.5 9.6 11.8 11.8 9.6 18.5Z" />
    </svg>
  )
}

/** The cursor element. The stage moves it (a transform on cursorRef) and marks it pressed or idle. */
export function Cursor({ cursorRef, style = 'real', kind }: { cursorRef: Ref<HTMLDivElement>; style?: CursorStyle; kind: CursorKind }) {
  const hot = style === 'arrow' ? ARROW_HOTSPOT : POINTER_HOTSPOT
  return (
    <div ref={cursorRef} className="ss-cursor" data-style={style} data-kind={kind} aria-hidden>
      {style === 'touch' && <span className="ss-cursor__streak" />}
      <div className="ss-cursor__press">
        {(style === 'circle' || style === 'touch') && <span className="ss-cursor__dot" />}
        {style !== 'circle' && style !== 'touch' && (
          <div className="ss-cursor__glyph" data-glyph="pointer" data-active style={{ marginLeft: -hot.x, marginTop: -hot.y, transformOrigin: `${hot.x}px ${hot.y}px` }}>
            {style === 'arrow' ? <SolidArrow /> : <MacPointer />}
          </div>
        )}
      </div>
    </div>
  )
}

/** A ring that spreads from the click point and fades, drawn under the cursor. */
export function ripple(root: HTMLElement, at: Point) {
  const r = document.createElement('span')
  r.className = 'ss-ripple'
  r.style.left = `${at.x}px`
  r.style.top = `${at.y}px`
  root.appendChild(r)
  r.addEventListener('animationend', () => r.remove())
}
