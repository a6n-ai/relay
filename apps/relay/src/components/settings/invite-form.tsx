import { type FormEvent, useState } from "react";
import { TextField } from "../form/text-field";
import { RoleChoice } from "./role-select";
import { type OrgRole } from "../../shared/roles";
import { inviteMemberFn, suggestMailboxFn } from "../../console/members.fns";
import { FormError, FormBody, FormActions } from "../form/form-parts";
import { ChoiceField } from "../form/choice-field";
import { AppField } from "../form/app-field";
import { DomainEmailInput } from "../form/domain-email-input";
import { useSubmit } from "../lib/use-submit";

type Mode = "mailbox" | "plain";

export function InviteForm({
  done,
  canGrantOwner,
  domains,
  apps,
}: {
  done: () => void;
  canGrantOwner: boolean;
  domains: { domain: string; status: string }[];
  apps: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<Mode>(domains.some((d) => d.status === "verified") ? "mailbox" : "plain");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [mailbox, setMailbox] = useState({ local: "", domain: "" });
  const [pickedApp, setAppId] = useState("");
  const appId = apps.length === 1 ? apps[0].id : pickedApp;
  const [role, setRole] = useState<OrgRole>("member");
  const { pending, error, run } = useSubmit();
  const withMailbox = mode === "mailbox";
  const address = `${mailbox.local}@${mailbox.domain}`;

  async function suggest() {
    if (!name.trim() || !mailbox.domain || mailbox.local) return;
    try {
      const { mailbox: found } = await suggestMailboxFn({ data: { name, domain: mailbox.domain } });
      if (found) setMailbox({ local: found.split("@")[0], domain: mailbox.domain });
    } catch {
      // a suggestion is optional, the field stays as typed
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await inviteMemberFn({ data: withMailbox ? { kind: "mailbox", name, recoveryEmail: email, mailbox: address, appId, role } : { email, role } });
    }, "Could not send the invite.", { success: "Invite sent", description: email, after: done });
  }

  return (
    <FormBody onSubmit={submit}>
      <ChoiceField
        id="invite-mode"
        label="Account"
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        options={[
          { value: "mailbox", label: "With mailbox", disabled: !domains.some((d) => d.status === "verified") },
          { value: "plain", label: "Without mailbox" },
        ]}
        describe={false}
      />
      {withMailbox ? <TextField id="invite-name" label="Name" required value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void suggest()} /> : null}
      <TextField
        id="invite-email"
        label={withMailbox ? "Personal email" : "Email"}
        type="email"
        required
        autoFocus={!withMailbox}
        placeholder="name@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {withMailbox ? (
        <>
          <DomainEmailInput id="invite-mailbox" label="Mailbox" kind="inbox" domains={domains} value={mailbox} onChange={setMailbox} hint="They sign in with this address. Codes go to their personal email." />
          {apps.length > 1 ? <AppField apps={apps} value={appId} onChange={setAppId} id="invite-app" /> : null}
        </>
      ) : null}
      <RoleChoice id="invite-role" value={role} onChange={setRole} canGrantOwner={canGrantOwner} />
      <FormError message={error} />
      <FormActions
        cancel
        submitLabel="Send invite"
        pending={pending}
        pendingLabel="Sending…"
        disabled={!email.trim() || (withMailbox && (!name.trim() || !mailbox.local || !mailbox.domain || !appId))}
        disabledReason={withMailbox ? "Fill in every field first." : "Enter an email first."}
      />
    </FormBody>
  );
}
