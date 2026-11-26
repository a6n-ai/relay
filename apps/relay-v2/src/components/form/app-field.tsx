import { useEffect } from "react";
import { ChoiceField } from "./choice-field";
import { Label } from "@foundry/ui/label";
import { Hint } from "../page/text";

type App = { id: string; name: string };

export function needsAppChoice(apps: App[], scopedAppId?: string | null) {
  return apps.length > 1 && !apps.some((a) => a.id === scopedAppId);
}

export function AppField({
  apps,
  scopedAppId,
  value,
  onChange,
  id = "app",
  autoFocus,
}: {
  apps: App[];
  scopedAppId?: string | null;
  value: string;
  onChange: (appId: string) => void;
  id?: string;
  autoFocus?: boolean;
}) {
  const scoped = scopedAppId ? apps.find((a) => a.id === scopedAppId) : undefined;
  const fixed = scoped ?? (apps.length === 1 ? apps[0] : undefined);
  const fixedId = fixed?.id;
  useEffect(() => {
    if (fixedId && fixedId !== value) onChange(fixedId);
  }, [fixedId, value]);
  if (fixed) {
    return (
      <div className="grid gap-1.5">
        <Label>App</Label>
        <Hint className="text-foreground">{fixed.name}</Hint>
      </div>
    );
  }
  return (
    <ChoiceField
      id={id}
      label="App"
      value={value}
      onChange={onChange}
      options={apps.map((a) => ({ value: a.id, label: a.name }))}
      autoFocus={autoFocus}
    />
  );
}
