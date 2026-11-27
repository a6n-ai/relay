import { useId } from "react";
import { Hint } from "../page/text";
import { Field } from "./field";

export function FixedField({ label, value, hint, hideLabel }: { label: string; value: string; hint?: string; hideLabel?: boolean }) {
  const id = useId();
  return (
    <Field id={id} label={label} hideLabel={hideLabel} hint={hint ?? "Can't be changed."} htmlFor={null}>
      <Hint className="text-foreground">{value}</Hint>
    </Field>
  );
}
