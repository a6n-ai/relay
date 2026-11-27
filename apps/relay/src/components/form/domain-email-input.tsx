import { useEffect } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@foundry/ui/input-group";
import { Hint } from "./text";
import { Field, fieldDescribedBy } from "./field";
import { ChoiceControl, type ChoiceOption } from "./choice-field";
import { choiceMode } from "./choice-mode";
import { addressDomains, defaultDomain, splitEmail } from "./domain-email";

type DomainEmailValue = { local: string; domain: string };

export function DomainEmailInput({
  id,
  domains,
  kind,
  value,
  onChange,
  autoFocus,
  label,
  hideLabel,
  hint,
  error,
}: {
  id: string;
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string | null;
  domains: { domain: string; status: string }[];
  kind: "sender" | "inbox" | "both";
  value: DomainEmailValue;
  onChange: (value: DomainEmailValue) => void;
  autoFocus?: boolean;
}) {
  const rows = addressDomains(domains, kind);
  const fallback = defaultDomain(rows);
  const stale = !!value.domain && !rows.find((r) => r.domain === value.domain && !r.disabled);
  useEffect(() => {
    if ((!value.domain || stale) && fallback !== value.domain) onChange({ ...value, domain: fallback });
  }, [fallback, value.domain, stale]);
  if (domains.length === 0) return null;
  const current = rows.find((r) => r.domain === value.domain);
  const only = rows.length === 1 ? rows[0] : undefined;
  const options: ChoiceOption[] = rows.map((r) => ({
    value: r.domain,
    label: r.domain,
    disabled: r.disabled,
    badge: r.pending ? "Pending" : undefined,
  }));
  const typed = (raw: string) => {
    const s = splitEmail(raw, rows.map((r) => r.domain));
    const next = s.domain && !rows.find((r) => r.domain === s.domain)?.disabled ? s.domain : value.domain || fallback;
    onChange({ local: s.local, domain: next });
  };
  const domain = value.domain;
  const blocked = kind === "sender" ? undefined : (only?.disabled ? only : current?.disabled ? current : undefined);
  return (
    <Field id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <InputGroup>
        <InputGroupInput id={id} autoFocus={autoFocus} aria-invalid={error ? true : undefined} aria-describedby={fieldDescribedBy(id, hint, error)} value={value.local} onChange={(e) => typed(e.target.value)} placeholder="name" autoComplete="off" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>@{only?.domain ?? domain}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {only ? null : (
        <>
          <span id={`${id}-domain-label`} className="sr-only">
            Domain
          </span>
          <ChoiceControl
            id={`${id}-domain`}
            labelledBy={`${id}-domain-label`}
            value={value.domain}
            onChange={(d) => onChange({ ...value, domain: d })}
            options={options}
            mode={rows.length <= 4 ? choiceMode(rows.length, { labels: options.map((o) => (o.badge ? `${o.label} ${o.badge}` : o.label)) }) : "combobox"}
          />
        </>
      )}
      {blocked ? <Hint size="xs">Verify {blocked.domain} first to receive mail on it.</Hint> : null}
      {current?.pending && kind === "sender" ? <Hint size="xs">Verify {current.domain} before mail sent from it is delivered.</Hint> : null}
    </Field>
  );
}
