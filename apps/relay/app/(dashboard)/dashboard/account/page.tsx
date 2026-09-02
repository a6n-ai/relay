import { UsersIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { getSession } from "@/lib/auth/session";
import { AccountSettingsForm } from "./account-settings-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session?.user) return null;
  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="Your account"
        subtitle="Name, appearance, and password."
      />
      <AccountSettingsForm
        email={session.user.email}
        name={session.user.name}
        role={session.user.role}
      />
    </PageShell>
  );
}
