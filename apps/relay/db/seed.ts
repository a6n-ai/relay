import { and, eq, isNull, sql } from "drizzle-orm";
import { hashPassword } from "@foundry/auth";
import { db } from "./client";
import { account, apiKeys, app, member, organization, tenants, users } from "./schema";
import { generateApiKey } from "../lib/api-keys";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "ops@relay.local";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD is required");

  await db.execute(sql`
    INSERT INTO app (id, public_id, app_id, created_at, updated_at, name, timezone)
    SELECT v.id, 'aps_default', v.id,
           (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
           (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
           'Relay', 'America/Toronto'
    FROM (SELECT next_id() AS id) v
    WHERE NOT EXISTS (SELECT 1 FROM app)
  `);

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  let operatorId = existing?.id;
  if (!existing) {
    const hash = await hashPassword(password);
    await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        email,
        name: "Relay operator",
        emailVerified: true,
        role: "admin",
        status: "active",
        passwordSet: true,
        platformRole: "super_admin",
      }).returning();
      await tx.insert(account).values({
        accountId: user.id.toString(),
        providerId: "credential",
        userId: user.id,
        password: hash,
      });
      operatorId = user.id;
    });
    console.log(`operator created: ${email}`);
  } else {
    console.log(`operator already exists: ${email}`);
  }

  // Seed ops are a6n platform staff (Foundry resolveVisibleOrgIds / Clients page).
  await db.update(users).set({ platformRole: "super_admin" }).where(eq(users.email, email));
  console.log(`operator platformRole=super_admin: ${email}`);

  const orgId = await ensureDefaultWorkspace(operatorId!);

  // Demo apps with live API keys are for local dev only; a production seed creates just the operator.
  if (process.env.SEED_DEMO_APPS === "1") await seedDemoApps(orgId);
}

/** Default a6n workspace + owner membership; attach orphan apps. */
async function ensureDefaultWorkspace(userId: bigint): Promise<string> {
  const slug = "a6n";
  let [org] = await db.select().from(organization).where(eq(organization.slug, slug)).limit(1);
  if (!org) {
    [org] = await db
      .insert(organization)
      .values({ name: "a6n", slug })
      .returning();
    console.log(`workspace created: ${slug}`);
  } else {
    console.log(`workspace already exists: ${slug}`);
  }

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, org.id), eq(member.userId, userId)))
    .limit(1);
  if (!membership) {
    await db.insert(member).values({
      organizationId: org.id,
      userId,
      role: "owner",
    });
    console.log(`operator joined workspace ${slug} as owner`);
  }

  const orphaned = await db
    .update(tenants)
    .set({ organizationId: org.id })
    .where(isNull(tenants.organizationId))
    .returning({ id: tenants.id });
  if (orphaned.length > 0) {
    console.log(`attached ${orphaned.length} app(s) to workspace ${slug}`);
  }

  return org.id;
}

async function seedDemoApps(organizationId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "realm-dev")).limit(1);
  if (!tenant) {
    const [created] = await db.insert(tenants).values({
      name: "Realm",
      slug: "realm-dev",
      mailingCountry: "CA",
      organizationId,
    }).returning();
    const key = generateApiKey();
    await db.insert(apiKeys).values({
      tenantId: created.id,
      name: "default",
      keyPrefix: key.prefix,
      keyHash: key.hash,
    });
    console.log(`tenant realm-dev API key (copy now): ${key.secret}`);
  } else {
    console.log("tenant realm-dev already exists");
  }

  // Sample apps only when asked, so they never leak into a real operator's app pickers.
  const sampleApps = process.env.SEED_SAMPLE_APPS === "true"
    ? ([
        { name: "Tiffin Grab", slug: "tiffin-grab" },
        { name: "Puchkaman", slug: "puchkaman" },
      ] as const)
    : [];
  for (const spec of sampleApps) {
    const [existing] = await db.select().from(tenants).where(eq(tenants.slug, spec.slug)).limit(1);
    if (existing) {
      console.log(`tenant ${spec.slug} already exists`);
      continue;
    }
    const [created] = await db.insert(tenants).values({
      name: spec.name,
      slug: spec.slug,
      mailingCountry: "CA",
      organizationId,
    }).returning();
    const key = generateApiKey();
    await db.insert(apiKeys).values({
      tenantId: created.id,
      name: "realm",
      keyPrefix: key.prefix,
      keyHash: key.hash,
    });
    console.log(`tenant ${spec.slug} API key (copy now): ${key.secret}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
