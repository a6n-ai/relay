import { PageShell } from "@foundry/design-system";
import { SettingsPage } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { getSession } from "@/lib/auth/session";
import { AccountSettingsForm } from "./account-settings-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session?.user) return null;
  return (
    <PageShell>
      <ViewHeader title="Your account" />
      <SettingsPage title="Your account">
        <AccountSettingsForm email={session.user.email} name={session.user.name} />
      </SettingsPage>
    </PageShell>
  );
}
