import { NAME_MAX } from "../../shared/limits";
import type { ComponentProps, ReactNode } from "react";
import { Input } from "@foundry/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@foundry/ui/input-group";
import { Field, fieldDescribedBy } from "./field";

type TextFieldProps = Omit<ComponentProps<"input">, "id" | "prefix"> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  onClearError?: () => void;
};

export function TextField({ id, label, hint, error, hideLabel, prefix, suffix, onClearError, onChange, ...input }: TextFieldProps) {
  const control = {
    ...input,
    id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": fieldDescribedBy(id, hint, error),
    onChange: (e: Parameters<NonNullable<typeof onChange>>[0]) => {
      if (error) onClearError?.();
      onChange?.(e);
    },
  };
  return (
    <Field id={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {prefix || suffix ? (
        <InputGroup>
          {prefix ? (
            <InputGroupAddon>
              <InputGroupText>{prefix}</InputGroupText>
            </InputGroupAddon>
          ) : null}
          <InputGroupInput {...control} />
          {suffix ? (
            <InputGroupAddon align="inline-end">
              <InputGroupText>{suffix}</InputGroupText>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      ) : (
        <Input {...control} />
      )}
    </Field>
  );
}

// The "Name" field of every create and rename form: required, capped at the shared limit unless a form has its own.
export function NameField({ required = true, maxLength = NAME_MAX, ...props }: Omit<TextFieldProps, "label">) {
  return <TextField label="Name" required={required} maxLength={maxLength} {...props} />;
}
