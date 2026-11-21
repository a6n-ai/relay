"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Switch } from "@foundry/ui/switch";
import { SettingsFooter, SettingsRow } from "@/components/ds/settings";
import { updateMailboxSendingAction } from "./actions";

export function MailboxSendingForm({
  publicId,
  canSend,
  displayName,
  isPeopleInbox,
}: {
  publicId: string;
  canSend: boolean;
  displayName: string | null;
  isPeopleInbox: boolean;
}) {
  const [checked, setChecked] = useState(canSend);
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string }, fd: FormData) => {
      const result = await updateMailboxSendingAction(fd);
      if (!result.error) toast.success("Saved");
      return result;
    },
    {},
  );

  return (
    <form action={action} className="divide-y divide-border">
      <input type="hidden" name="publicId" value={publicId} />
      <SettingsRow
        label="Can send"
        description={isPeopleInbox ? "People inboxes send from their own mail host" : undefined}
      >
        <Switch
          name="canSend"
          aria-label="Can send"
          checked={checked}
          onCheckedChange={setChecked}
          disabled={isPeopleInbox && !canSend}
        />
      </SettingsRow>
      <SettingsRow label="Display name">
        <Input name="displayName" aria-label="Display name" defaultValue={displayName ?? ""} className="w-56" />
      </SettingsRow>
      <SettingsFooter>
        {state.error ? <p className="text-destructive mr-auto text-sm">{state.error}</p> : null}
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
      </SettingsFooter>
    </form>
  );
}
