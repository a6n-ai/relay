import { Label } from "@foundry/ui/label";
import { Hint } from "../page/text";

export function FixedField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Hint className="text-foreground">{value}</Hint>
      <Hint size="xs">Can't be changed.{hint ? ` ${hint}` : ""}</Hint>
    </div>
  );
}
