import { PageShell } from "@foundry/design-system";
import { getSession } from "@/lib/auth/session";
import { AccountSettingsForm } from "./account-settings-form";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session?.user) return null;
  return (
    <PageShell>
      <ViewHeader
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
