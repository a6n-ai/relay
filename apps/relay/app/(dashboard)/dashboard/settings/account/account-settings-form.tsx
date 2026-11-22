"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "@foundry/themes";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Switch } from "@foundry/ui/switch";
import { cn } from "@foundry/ui/cn";
import { SettingsBody, SettingsFooter, SettingsRow, SettingsSection } from "@/components/ds/settings";
import { authClient } from "@/lib/auth/client";

const THEMES = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const;

export function AccountSettingsForm({ email, name }: { email: string; name: string }) {
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState(name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveProfile() {
    setSaving(true);
    const { error } = await authClient.updateUser({ name: displayName });
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Could not update profile");
      return;
    }
    toast.success("Profile updated");
  }

  async function updatePassword() {
    if (newPassword !== confirm) {
      toast.error("New password and confirmation do not match");
      return;
    }
    setSaving(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Could not update password");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    toast.success("Password updated");
  }

  return (
    <>
      <SettingsSection title="Profile" description="How you appear in Relay. Email is your sign-in.">
        <SettingsRow label="Display name">
          <Input
            aria-label="Display name"
            className="w-64"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </SettingsRow>
        <SettingsRow label="Email">
          <span className="font-mono text-xs text-muted-foreground">{email}</span>
        </SettingsRow>
        <SettingsFooter>
          <Button type="button" disabled={saving} onClick={() => void saveProfile()}>
            Save changes
          </Button>
        </SettingsFooter>
      </SettingsSection>

      <SettingsSection title="Appearance" description="Follow light, dark, or the system setting.">
        <SettingsBody>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/40 active:bg-muted/60",
                  theme === opt.value && "border-primary ring-1 ring-primary",
                )}
              >
                <opt.Icon className="size-4" />
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </SettingsBody>
      </SettingsSection>

      <SettingsSection title="Password" description="Other sessions are signed out when you change it.">
        <SettingsRow label="Current password">
          <Input
            aria-label="Current password"
            type="password"
            autoComplete="current-password"
            className="w-64"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </SettingsRow>
        <SettingsRow label="New password">
          <Input
            aria-label="New password"
            type="password"
            autoComplete="new-password"
            className="w-64"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </SettingsRow>
        <SettingsRow label="Confirm new password">
          <Input
            aria-label="Confirm new password"
            type="password"
            autoComplete="new-password"
            className="w-64"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </SettingsRow>
        <SettingsRow label="Two-factor authentication" description="Not wired for operators yet.">
          <Switch disabled aria-label="Two-factor authentication" />
        </SettingsRow>
        <SettingsFooter>
          <Button type="button" disabled={saving} onClick={() => void updatePassword()}>
            Update password
          </Button>
        </SettingsFooter>
      </SettingsSection>
    </>
  );
}
