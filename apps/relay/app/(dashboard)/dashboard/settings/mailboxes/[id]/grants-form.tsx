"use client";

import { useState, useTransition } from "react";
import { toast } from "@foundry/ui/toast";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { SettingsFooter, SettingsRow } from "@/components/ds/settings";
import { addMailboxGrantAction, removeMailboxGrantAction } from "./actions";

type Grant = { publicId: string; kind: "team" | "member"; label: string };
type Option = { value: string; label: string; target: { teamId: string } | { memberPublicId: string } };

export function MailboxGrantsForm({
  mailboxPublicId,
  grants,
  teams,
  members,
}: {
  mailboxPublicId: string;
  grants: Grant[];
  teams: { id: string; name: string }[];
  members: { publicId: string; label: string }[];
}) {
  const options: Option[] = [
    ...teams.map((t) => ({ value: `team:${t.id}`, label: t.name, target: { teamId: t.id } })),
    ...members.map((m) => ({ value: `member:${m.publicId}`, label: m.label, target: { memberPublicId: m.publicId } })),
  ];
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function add() {
    const picked = options.find((o) => o.value === value);
    if (!picked) return;
    start(async () => {
      const result = await addMailboxGrantAction(mailboxPublicId, picked.target);
      setError(result.error);
      if (!result.error) {
        setValue("");
        toast.success("Access added");
      }
    });
  }

  function remove(grantPublicId: string) {
    start(async () => {
      const result = await removeMailboxGrantAction(grantPublicId);
      if (result.error) toast.error(result.error);
      else toast.success("Access removed");
    });
  }

  return (
    <div className="divide-y divide-border">
      {grants.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Only owners and admins can see this mailbox.</p> : null}
      {grants.map((g) => (
        <SettingsRow key={g.publicId} label={g.label} description={g.kind === "team" ? "Team" : "Person"}>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(g.publicId)}>
            Remove
          </Button>
        </SettingsRow>
      ))}
      <SettingsRow label="Add a team or person">
        <div className="flex items-center gap-2">
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger aria-label="Team or person" className="w-56">
              <SelectValue placeholder="Pick a team or person" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!value || pending} onClick={add}>
            Add
          </Button>
        </div>
      </SettingsRow>
      {error ? (
        <SettingsFooter>
          <p className="text-destructive mr-auto text-sm">{error}</p>
        </SettingsFooter>
      ) : null}
    </div>
  );
}
