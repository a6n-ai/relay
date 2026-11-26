import { Hint } from "../page/text";
import { Field } from "./field";

export function FixedField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const id = `fixed-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <Field id={id} label={label} hint={`Can't be changed.${hint ? ` ${hint}` : ""}`} htmlFor={null}>
      <Hint className="text-foreground">{value}</Hint>
    </Field>
  );
}
