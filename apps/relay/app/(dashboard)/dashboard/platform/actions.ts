"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/auth/org-scope";
import { db } from "@/db/client";
import { organization, users } from "@/db/schema";

function parseNonNegInt(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(raw ?? "");
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createClientAction(
  formData: FormData,
): Promise<{ id?: string; ownerEmail?: string; error?: string }> {
  await requirePlatformAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const slug = slugRaw || slugify(name);
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();
  const monthlyMessageQuota = parseNonNegInt(formData.get("monthlyMessageQuota"), 0);
  const maxApps = parseNonNegInt(formData.get("maxApps"), 0);
  if (!name || !slug) return { error: "Name is required." };
  if (!ownerEmail) return { error: "Owner email is required." };
  if (!EMAIL_RE.test(ownerEmail)) return { error: "Enter a valid owner email." };

  try {
    const [existing] = await db
      .select({ id: users.id, banned: users.banned })
      .from(users)
      .where(eq(users.email, ownerEmail))
      .limit(1);
    if (existing?.banned) return { error: "That user is banned and can't own a workspace." };
    let ownerId = existing ? String(existing.id) : null;
    if (!ownerId) {
      // Session-less server call: no headers, so no admin-plugin permission check. The guard above authorizes.
      const { user } = await auth.api.createUser({
        body: { email: ownerEmail, name: ownerEmail.split("@")[0], role: "user" },
      });
      ownerId = user.id;
      await db.update(users).set({ passwordSet: false }).where(eq(users.id, BigInt(ownerId)));
    }

    // No headers: a session-less call makes the owner, not the platform admin, the org owner.
    const created = await auth.api.createOrganization({
      body: { name, slug, userId: ownerId },
    });
    const id = created?.id;
    if (!id) return { error: "Could not create client." };
    // The owner is the creator here, so the after-create hook sees a non-staff user and writes self-serve defaults; overwrite them.
    await db
      .update(organization)
      .set({ monthlyMessageQuota, maxApps, selfServe: false })
      .where(eq(organization.id, id));
    revalidatePath("/dashboard/platform");
    return { id, ownerEmail };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create client." };
  }
}

export async function updateClientLimitsAction(
  formData: FormData,
): Promise<{ error?: string }> {
  await requirePlatformAdmin();
  const id = String(formData.get("organizationId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const monthlyMessageQuota = parseNonNegInt(formData.get("monthlyMessageQuota"), -1);
  const maxApps = parseNonNegInt(formData.get("maxApps"), -1);
  if (!id) return { error: "Missing client." };
  if (!name) return { error: "Name is required." };
  if (monthlyMessageQuota < 0 || maxApps < 0) {
    return { error: "Limits must be 0 or a positive integer." };
  }

  const [row] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, id)).limit(1);
  if (!row) return { error: "Client not found." };

  await db
    .update(organization)
    .set({ name, monthlyMessageQuota, maxApps })
    .where(eq(organization.id, id));
  revalidatePath("/dashboard/platform");
  revalidatePath(`/dashboard/platform/${id}`);
  return {};
}
