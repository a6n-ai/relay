import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";

// allLabel adds an "All apps" row (value "all") above the apps.
export function AppSelect({
  apps,
  value,
  onValueChange,
  id,
  label = "App",
  placeholder,
  allLabel,
  className = "w-full",
}: {
  apps: { id: string; name: string }[];
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  allLabel?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allLabel ? <SelectItem value="all">{allLabel}</SelectItem> : null}
        {apps.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
