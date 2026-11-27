import { type ReactNode, useState } from "react";
import { ChevronsUpDownIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@foundry/ui/command";
import { Label } from "@foundry/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@foundry/ui/toggle-group";
import { Hint } from "./text";
import { Field, fieldDescribedBy } from "./field";
import { choiceMode, type ChoiceModeName } from "./choice-mode";

export type ChoiceOption = { value: string; label: string; description?: string; disabled?: boolean; badge?: string };

type ControlProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  mode: ChoiceModeName;
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
  autoFocus?: boolean;
};

function Combobox({ id, value, onChange, options, labelledBy, describedBy, invalid, autoFocus }: ControlProps) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} autoFocus={autoFocus} variant="outline" role="combobox" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-expanded={open} className="w-full justify-between font-normal" />}>
        <span className="truncate">{current?.label ?? "Select…"}</span>
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) p-0">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty className="empty:hidden">No matches.</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                label={o.label}
                disabled={o.disabled}
                data-checked={o.value === value}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
                {o.badge ? <Badge variant="secondary">{o.badge}</Badge> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ChoiceControl(props: ControlProps) {
  const { id, value, onChange, options, mode, labelledBy, describedBy, invalid, autoFocus } = props;
  if (mode === "combobox") return <Combobox {...props} />;
  if (mode === "select") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} autoFocus={autoFocus} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined} className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
              {o.badge ? <Badge variant="secondary">{o.badge}</Badge> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (mode === "cards") {
    return (
      <RadioGroup id={id} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined} value={value} onValueChange={onChange}>
        {options.map((o, i) => (
          <Label
            key={o.value}
            className="items-start gap-3 rounded-(--ui-radius-control) border border-input p-3 font-normal has-data-checked:border-ring has-data-disabled:opacity-50"
          >
            <RadioGroupItem value={o.value} disabled={o.disabled} autoFocus={autoFocus && i === 0} className="mt-0.5" />
            <span className="grid min-w-0 gap-1">
              <span className="flex items-center gap-2 break-all font-medium">
                {o.label}
                {o.badge ? <Badge variant="secondary">{o.badge}</Badge> : null}
              </span>
              {o.description ? <Hint as="span" size="xs">{o.description}</Hint> : null}
            </span>
          </Label>
        ))}
      </RadioGroup>
    );
  }
  return (
    <ToggleGroup
      id={id}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      type="single"
      spacing={0.5}
      className="w-full bg-muted p-0.5"
      value={value}
      onValueChange={(v) => v && onChange(v)}
    >
      {options.map((o, i) => (
        <ToggleGroupItem key={o.value} value={o.value} disabled={o.disabled} autoFocus={autoFocus && i === 0} className="min-w-0 flex-1 shrink rounded-[calc(var(--ui-radius-control)-2px)] text-muted-foreground hover:bg-transparent data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm dark:data-pressed:bg-input">
          <span className="truncate">{o.label}</span>
          {o.badge ? <Badge variant="secondary">{o.badge}</Badge> : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ChoiceField({
  id,
  label,
  value,
  onChange,
  options,
  describe,
  people,
  autoFocus,
  hideLabel,
  hint,
  error,
  onClearError,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  describe?: boolean;
  people?: boolean;
  autoFocus?: boolean;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  onClearError?: () => void;
}) {
  const mode = choiceMode(options.length, {
    describe: describe ?? options.some((o) => o.description),
    people,
    labels: options.map((o) => (o.badge ? `${o.label} ${o.badge}` : o.label)),
  });
  return (
    <Field id={id} label={label} hideLabel={hideLabel} hint={hint} error={error} htmlFor={mode === "segmented" || mode === "cards" ? null : id}>
      <ChoiceControl
        id={id}
        value={value}
        onChange={(v) => {
          if (error) onClearError?.();
          onChange(v);
        }}
        options={options}
        mode={mode}
        labelledBy={`${id}-label`}
        describedBy={fieldDescribedBy(id, hint, error)}
        invalid={!!error}
        autoFocus={autoFocus}
      />
    </Field>
  );
}
