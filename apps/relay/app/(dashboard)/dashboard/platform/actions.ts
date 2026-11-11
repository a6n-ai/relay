"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/auth/org-scope";
import { db } from "@/db/client";
import { organization } from "@/db/schema";

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

export async function createClientAction(
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  await requirePlatformAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const slug = slugRaw || slugify(name);
  const monthlyMessageQuota = parseNonNegInt(formData.get("monthlyMessageQuota"), 0);
  const maxApps = parseNonNegInt(formData.get("maxApps"), 0);
  if (!name || !slug) return { error: "Name is required." };

  try {
    const created = await auth.api.createOrganization({
      headers: await headers(),
      body: {
        name,
        slug,
        keepCurrentActiveOrganization: true,
      },
    });
    const id = created?.id;
    if (!id) return { error: "Could not create client." };
    await db
      .update(organization)
      .set({ monthlyMessageQuota, maxApps })
      .where(eq(organization.id, id));
    revalidatePath("/dashboard/platform");
    return { id };
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
