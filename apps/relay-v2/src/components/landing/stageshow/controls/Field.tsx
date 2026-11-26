import type { HTMLAttributes, ReactNode } from 'react'
import './Field.css'

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label?: ReactNode
  value: string
  placeholder?: string
  /** Props for the input box itself, the thing to click: data-target, data-cursor. */
  box?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, unknown>
}

/** A static text field: label, box, value or placeholder. Put data-target on `box`, the part a cursor clicks. */
export function Field({ label, value, placeholder, box, className, style, ...rest }: FieldProps) {
  return (
    <div {...rest} className={`ss-field${className ? ` ${className}` : ''}`} data-filled={value ? true : undefined} style={style}>
      {label && <span className="ss-field__label">{label}</span>}
      <div data-cursor="ibeam" {...box} className={`ss-field__box${box?.className ? ` ${box.className}` : ''}`}>
        <span className="ss-field__text">
          {placeholder && <span className="ss-field__placeholder">{placeholder}</span>}
          <span className="ss-field__value">
            <span className="ss-field__chars">{value}</span>
          </span>
        </span>
      </div>
    </div>
  )
}
