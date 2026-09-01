import { UsersIcon } from "lucide-react";
import { PageHeader } from "@foundry/design-system";
import { getSession } from "@/lib/auth/session";
import { AccountSettingsForm } from "./account-settings-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session?.user) return null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={UsersIcon}
        title="Account"
        subtitle="Profile, appearance, and password for this operator."
      />
      <AccountSettingsForm
        email={session.user.email}
        name={session.user.name}
        role={session.user.role}
      />
    </div>
  );
}
