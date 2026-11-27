import { useState, type ReactNode } from "react";
import { Label } from "@foundry/ui/label";
import { Hint } from "./text";

export function fieldDescribedBy(id: string, hint?: ReactNode, error?: string | null) {
  return [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
}

export function Field({
  id,
  label,
  hint,
  error,
  htmlFor,
  hideLabel,
  children,
}: {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string | null;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      {label ? (
        <Label id={`${id}-label`} className={hideLabel ? "sr-only" : undefined} htmlFor={htmlFor === null ? undefined : (htmlFor ?? id)}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {hint ? (
        <Hint id={`${id}-hint`} size="xs">
          {hint}
        </Hint>
      ) : null}
    </div>
  );
}

export function withoutKey<K extends string>(errors: Partial<Record<K, string>>, key: K) {
  if (!(key in errors)) return errors;
  const { [key]: _, ...rest } = errors;
  return rest as Partial<Record<K, string>>;
}

// A form keeps one error per field. Pass `error={errors.name}` and `onClearError={() => clear("name")}` to the field.
export function useFieldErrors<K extends string>() {
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  return { errors, set: setErrors, clear: (key: K) => setErrors((e) => withoutKey(e, key)) };
}
