import { Button } from "@foundry/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Switch } from "@foundry/ui/switch";
import { useState } from "react";
import { Hint } from "../page/text";

export type Person = { id: string; name: string; email: string };
export type Team = { id: string; name: string; memberIds: string[] };

const SEARCH_ABOVE = 8;

// Opened from a row menu, so the parent owns open state.
export function TeamMembersDialog({
  team,
  people,
  open,
  onOpenChange,
  onToggle,
}: {
  team: Team;
  people: Person[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (memberId: string, on: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(needle)) : people;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Members of {team.name}</DialogTitle>
          <DialogDescription>
            {team.memberIds.length} of {people.length} members in this team.
          </DialogDescription>
        </DialogHeader>
        {people.length > SEARCH_ABOVE ? (
          <Input type="search" autoFocus placeholder="Search members" aria-label="Search members" value={q} onChange={(e) => setQ(e.target.value)} />
        ) : null}
        {people.length === 0 ? (
          <Hint>No members in this workspace yet. Invite people first.</Hint>
        ) : (
          <ul className="grid max-h-80 gap-3 overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="grid min-w-0">
                  <span className="truncate text-sm">{p.name}</span>
                  <Hint as="span" size="xs" className="truncate">{p.email}</Hint>
                </span>
                <Switch
                  checked={team.memberIds.includes(p.id)}
                  onCheckedChange={(on) => onToggle(p.id, on)}
                  aria-label={`${p.name} in ${team.name}`}
                />
              </li>
            ))}
            {shown.length === 0 ? <Hint>No members match.</Hint> : null}
          </ul>
        )}
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
