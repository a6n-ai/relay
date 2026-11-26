import type { HTMLAttributes } from 'react'
import { Roll } from '../motion/Roll'
import './Button.css'

export type ButtonProps = HTMLAttributes<HTMLSpanElement> & {
  /** primary: the accent fill. secondary (the default): the surface with a hairline ring. ghost: no fill until hovered. */
  variant?: 'primary' | 'secondary' | 'ghost'
}

/**
 * A push button: `flex: none`, one line, padded once so a row never squeezes it. A click from the
 * cursor presses it (the stage marks it data-pressed) and hovering marks it data-hover. Put
 * data-target on it to aim the cursor. A text label changes through Roll's fade, and the button
 * eases to its new width.
 */
export function Button({ variant = 'secondary', children, className, ...rest }: ButtonProps) {
  return (
    <span role="button" data-cursor="pointer" {...rest} className={`ss-button${className ? ` ${className}` : ''}`} data-variant={variant}>
      {children != null && children !== false && (
        <span className="ss-button__label">{typeof children === 'string' || typeof children === 'number' ? <Roll variant="fade">{String(children)}</Roll> : children}</span>
      )}
    </span>
  )
}
