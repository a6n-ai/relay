import { useEffect } from "react";
import { AppSelect } from "../app-select";
import { Label } from "@foundry/ui/label";
import { Hint } from "../page/text";

type App = { id: string; name: string };

export function AppField({
  apps,
  scopedAppId,
  value,
  onChange,
  id = "app",
}: {
  apps: App[];
  scopedAppId?: string | null;
  value: string;
  onChange: (appId: string) => void;
  id?: string;
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
    <div className="grid gap-1.5">
      <Label htmlFor={id}>App</Label>
      <AppSelect id={id} apps={apps} value={value} onValueChange={onChange} placeholder="Choose an app" />
    </div>
  );
}
