import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Switch } from "@foundry/ui/switch";

export type Person = { id: string; name: string; email: string };
export type Team = { id: string; name: string; memberIds: string[] };

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{team.name}</DialogTitle>
        </DialogHeader>
        <ul className="grid gap-3">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">{p.name}</span>
              <Switch
                checked={team.memberIds.includes(p.id)}
                onCheckedChange={(on) => onToggle(p.id, on)}
                aria-label={`${p.name} in ${team.name}`}
              />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
