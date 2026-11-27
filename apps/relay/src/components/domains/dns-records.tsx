import { Button } from "@foundry/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { Hint } from "../form/text";

type DnsRecord = { type: "CNAME"; name: string; value: string };

export function DnsRecords({ records }: { records: DnsRecord[] }) {
  if (records.length === 0) return <Hint as="span" size="xs">Not available yet</Hint>;
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button variant="ghost" />}>DNS records ({records.length})</CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 grid gap-3 text-xs">
          {records.map((r) => (
            <li key={r.name} className="grid gap-1">
              <span className="font-mono break-all">{r.name}</span>
              <span className="text-muted-foreground">
                {r.type} to <span className="font-mono break-all">{r.value}</span>
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
