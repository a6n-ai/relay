"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "@foundry/themes";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@foundry/ui/card";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { cn } from "@foundry/ui/cn";
import { authClient } from "@/lib/auth/client";

type ThemeChoice = "light" | "dark" | "system";

function initials(email: string, name: string) {
  const fromName = name.trim().split(/\s+/).filter(Boolean);
  if (fromName.length >= 2) return (fromName[0][0] + fromName[1][0]).toUpperCase();
  if (fromName.length === 1 && fromName[0].length >= 2) return fromName[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export function AccountSettingsForm({
  email,
  name,
  role,
}: {
  email: string;
  name: string;
  role: string;
}) {
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-px bg-border">
      <Card className="gap-0 rounded-none">
        <CardHeader className="border-b border-border">
          <CardTitle>Profile</CardTitle>
          <CardDescription>How this operator appears in Relay. Email is the sign-in identity.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-6">
          <div className="flex items-center gap-4">
            <Avatar size="lg" className="rounded-none">
              <AvatarFallback className="rounded-none">{initials(email, displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{displayName || email}</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="truncate font-mono text-xs text-muted-foreground">{email}</p>
                <Badge variant="secondary">{role}</Badge>
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled />
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2 rounded-none">
          <Button type="button" disabled={saving} onClick={() => void saveProfile()}>
            Save changes
          </Button>
        </CardFooter>
      </Card>

      <Card className="gap-0 rounded-none">
        <CardHeader className="border-b border-border">
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Lyra canvas follows light, dark, or the OS preference.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-px bg-border p-0 sm:grid-cols-3">
          {(
            [
              { value: "light", label: "Light", Icon: SunIcon },
              { value: "dark", label: "Dark", Icon: MoonIcon },
              { value: "system", label: "System", Icon: MonitorIcon },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              className={cn(
                "flex flex-col items-start gap-3 bg-card p-6 text-left transition-colors hover:bg-muted/40",
                theme === opt.value && "ring-1 ring-primary",
              )}
            >
              <opt.Icon />
              <span className="text-sm font-medium">{opt.label}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-none">
        <CardHeader className="border-b border-border">
          <CardTitle>Password & security</CardTitle>
          <CardDescription>Change the password for this operator. Other sessions will be signed out.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="next">New password</Label>
              <Input
                id="next"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 border border-border p-4">
            <div>
              <p className="text-sm font-medium">Two-factor authentication</p>
              <p className="text-sm text-muted-foreground">Not wired for operators yet.</p>
            </div>
            <Switch disabled aria-label="Two-factor authentication" />
          </div>
        </CardContent>
        <CardFooter className="justify-end rounded-none">
          <Button type="button" disabled={saving} onClick={() => void updatePassword()}>
            Update password
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
