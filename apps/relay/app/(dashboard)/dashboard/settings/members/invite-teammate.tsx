"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { inviteTeammateAction } from "./actions";
import type { RoleOption } from "./member-roles-form";

export function InviteTeammate({ roleOptions }: { roleOptions: RoleOption[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["member"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(value: string, checked: boolean) {
    setRoles((prev) => (checked ? [...prev, value] : prev.filter((r) => r !== value)));
  }

  function send() {
    setError(null);
    startTransition(async () => {
      const res = await inviteTeammateAction({ email, roles });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Invite sent");
      setEmail("");
      setRoles(["member"]);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Invite teammate</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite teammate</DialogTitle>
          <DialogDescription>They get an email with a link to join this workspace.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-medium">Email</span>
            <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Roles</legend>
            {roleOptions.map((o) => (
              <label key={o.value} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  name="roles"
                  value={o.value}
                  checked={roles.includes(o.value)}
                  disabled={o.disabled || pending}
                  onChange={(e) => toggle(o.value, e.target.checked)}
                />
                <span className="flex flex-col">
                  <span className="font-medium">{o.label}</span>
                  <span className="text-muted-foreground text-xs">{o.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
