import { SettingsCard } from "../page/settings-card";

export function SuspendedNotice() {
  return (
    <div className="px-4 pt-3">
      <SettingsCard
        title="Workspace suspended"
        description="Members, invites and teams are read-only while the workspace is suspended."
      />
    </div>
  );
}
