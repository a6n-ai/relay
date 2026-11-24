import { Button } from "@foundry/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";

export type DnsRecord = { type: "CNAME"; name: string; value: string };

export function DnsRecords({ records }: { records: DnsRecord[] }) {
  if (records.length === 0) return <span className="text-xs text-muted-foreground">Not available yet</span>;
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>DNS records ({records.length})</CollapsibleTrigger>
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
