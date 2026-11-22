"use client";

import { useState, useTransition } from "react";
import { toast } from "@foundry/ui/toast";
import { EllipsisIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import { removeMemberAction, setMemberStatusAction } from "./actions";
import { MemberRolesForm, type RoleOption } from "./member-roles-form";

export function MemberRowActions({
  memberPublicId,
  name,
  status,
  roles,
  roleOptions,
  canUpdate,
  canDelete,
}: {
  memberPublicId: string;
  name: string;
  status: "active" | "suspended";
  roles: string[];
  roleOptions: RoleOption[];
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [dialog, setDialog] = useState<"roles" | "remove" | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleStatus() {
    const next = status === "active" ? "suspended" : "active";
    startTransition(async () => {
      const res = await setMemberStatusAction(memberPublicId, next);
      if (res.error) toast.error(res.error);
      else toast.success(next === "suspended" ? "Suspended" : "Reactivated");
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeMemberAction(memberPublicId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Removed from workspace");
      setDialog(null);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canUpdate ? <DropdownMenuItem onClick={() => setDialog("roles")}>Change roles</DropdownMenuItem> : null}
          {canUpdate ? (
            <DropdownMenuItem disabled={pending} onClick={toggleStatus}>
              {status === "active" ? "Suspend" : "Reactivate"}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDialog("remove")}>Remove from workspace</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "roles"} onOpenChange={(open) => setDialog(open ? "roles" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change roles</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          <MemberRolesForm
            memberPublicId={memberPublicId}
            current={roles}
            options={roleOptions}
            onDone={() => setDialog(null)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "remove"} onOpenChange={(open) => setDialog(open ? "remove" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {name}?</DialogTitle>
            <DialogDescription>They lose access to this workspace. Their account stays.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
