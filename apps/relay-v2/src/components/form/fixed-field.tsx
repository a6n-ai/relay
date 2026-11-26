import { useId } from "react";
import { Hint } from "../page/text";
import { Field } from "./field";

export function FixedField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={`Can't be changed.${hint ? ` ${hint}` : ""}`} htmlFor={null}>
      <Hint className="text-foreground">{value}</Hint>
    </Field>
  );
}
