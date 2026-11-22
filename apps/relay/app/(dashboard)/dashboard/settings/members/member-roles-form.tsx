"use client";

import { useState, useTransition } from "react";
import { toast } from "@foundry/ui/toast";
import { Button } from "@foundry/ui/button";
import { DialogFooter } from "@foundry/ui/dialog";
import { setMemberRolesAction } from "./actions";

export type RoleOption = { value: string; label: string; description: string; disabled: boolean };

export function MemberRolesForm({
  memberPublicId,
  current,
  options,
  onDone,
}: {
  memberPublicId: string;
  current: string[];
  options: RoleOption[];
  onDone: () => void;
}) {
  const [roles, setRoles] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(value: string, checked: boolean) {
    setRoles((prev) => (checked ? [...prev, value] : prev.filter((r) => r !== value)));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setMemberRolesAction(memberPublicId, roles);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Roles updated");
      onDone();
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Roles</legend>
        {options.map((o) => (
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
          Save roles
        </Button>
      </DialogFooter>
    </form>
  );
}
