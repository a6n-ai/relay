"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { CreateFooter, CreateTitleField, useCreateDialog } from "@/components/ds/create-dialog";
import {
  addTeamMemberAction,
  createTeamAction,
  deleteTeamAction,
  removeTeamMemberAction,
  renameTeamAction,
} from "./actions";

export function CreateTeamForm() {
  const { created } = useCreateDialog();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await createTeamAction(name);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      created({ noun: "Team", name: name.trim() });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <CreateTitleField
        label="Team name"
        placeholder="Team name, like Sales"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
      />
      <CreateFooter>
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Create team"}
        </Button>
      </CreateFooter>
    </div>
  );
}

export function RenameTeamDialog({ teamId, name }: { teamId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await renameTeamAction(teamId, value);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Team renamed");
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(name);
        setError(null);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Rename
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename team</DialogTitle>
          <DialogDescription>Members keep their place on the team.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-medium">Name</span>
            <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} required />
          </label>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTeamDialog({ teamId, name }: { teamId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteTeamAction(teamId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Team deleted");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>People stay in the workspace. Only this team goes.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" disabled={pending} onClick={remove}>
            Delete team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddTeamMemberForm({
  teamId,
  options,
}: {
  teamId: string;
  options: { publicId: string; label: string }[];
}) {
  const [who, setWho] = useState(options[0]?.publicId ?? "");
  const [pending, startTransition] = useTransition();

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">Everyone in this workspace is on the team.</p>;
  }

  function add() {
    startTransition(async () => {
      const res = await addTeamMemberAction(teamId, who);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Added to the team");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={`add-${teamId}`} className="sr-only">
        Person
      </Label>
      <select
        id={`add-${teamId}`}
        className="border-input bg-background h-8 min-w-0 flex-1 border px-2 text-sm"
        value={who}
        onChange={(e) => setWho(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.publicId} value={o.publicId}>
            {o.label}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={pending || !who} onClick={add}>
        Add
      </Button>
    </div>
  );
}

export function RemoveTeamMemberButton({ teamId, memberPublicId, name }: { teamId: string; memberPublicId: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await removeTeamMemberAction(teamId, memberPublicId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${name} removed from the team`);
    });
  }

  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={remove}>
      Remove
    </Button>
  );
}
