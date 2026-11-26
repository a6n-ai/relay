import { Input } from "@foundry/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@foundry/ui/input-group";
import { Hint, Mono } from "../page/text";
import { ChoiceControl, type ChoiceOption } from "./choice-field";
import { addressDomains, splitEmail } from "./domain-email";

export type DomainEmailValue = { local: string; domain: string };

export function DomainEmailInput({
  id,
  domains,
  kind,
  value,
  onChange,
}: {
  id: string;
  domains: { domain: string; status: string }[];
  kind: "sender" | "inbox" | "both";
  value: DomainEmailValue;
  onChange: (value: DomainEmailValue) => void;
}) {
  if (domains.length === 0) return null;
  const rows = addressDomains(domains, kind);
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
    const next = s.domain && !rows.find((r) => r.domain === s.domain)?.disabled ? s.domain : value.domain;
    onChange({ local: s.local, domain: next });
  };
  const domain = only?.domain ?? value.domain;
  return (
    <div className="grid gap-2">
      {only ? (
        <InputGroup>
          <InputGroupInput id={id} value={value.local} onChange={(e) => typed(e.target.value)} placeholder="name" autoComplete="off" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>@{only.domain}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <>
          <Input id={id} value={value.local} onChange={(e) => typed(e.target.value)} placeholder="name" autoComplete="off" />
          <ChoiceControl
            id={`${id}-domain`}
            value={value.domain}
            onChange={(d) => onChange({ ...value, domain: d })}
            options={options}
            mode={rows.length <= 4 ? "segmented" : "combobox"}
          />
        </>
      )}
      {value.local && domain ? (
        <Mono className="text-muted-foreground">
          {value.local}@{domain}
        </Mono>
      ) : null}
      {current?.pending && kind === "sender" ? <Hint size="xs">Verify {current.domain} before mail sent from it is delivered.</Hint> : null}
    </div>
  );
}
