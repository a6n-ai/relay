import { ToggleGroup, ToggleGroupItem } from "@foundry/ui/toggle-group";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { type View, viewPref } from "./view-pref";

export function ViewToggle({ route, value, onChange }: { route: string; value: View; onChange: (v: View) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(v) => {
        if (v !== "list" && v !== "grid") return;
        viewPref.write(route, v);
        onChange(v);
      }}
      aria-label="View"
    >
      <ToggleGroupItem value="list" aria-label="List view">
        <ListIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <LayoutGridIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
