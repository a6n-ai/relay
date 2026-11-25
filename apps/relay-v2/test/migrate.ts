import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain } from "../src/db/core/schema";

type MigrationBindings = { TEST_SECURITY_MIGRATIONS: D1Migration[]; TEST_CORE_MIGRATIONS: D1Migration[] };

export async function applyMigrations(): Promise<void> {
  const { TEST_SECURITY_MIGRATIONS, TEST_CORE_MIGRATIONS } = env as typeof env & MigrationBindings;
  await applyD1Migrations(env.SECURITY_DB, TEST_SECURITY_MIGRATIONS);
  await applyD1Migrations(env.CORE_DB, TEST_CORE_MIGRATIONS);
}

// The workspace's security row must already exist. Storage persists across tests in a file, and domain and
// email are unique, so a re-seed moves ownership to this workspace: each test sends from one workspace.
export async function seedVerifiedSender(workspaceId: string, appId = "app_1"): Promise<void> {
  await coreDb(env)
    .insert(sendingDomain)
    .values({ workspaceId, domain: "a6n.ai", sesRegion: "ap-south-1", status: "verified" })
    .onConflictDoUpdate({ target: sendingDomain.domain, set: { workspaceId, sesRegion: "ap-south-1", status: "verified" } });
  await coreDb(env)
    .insert(address)
    .values({ workspaceId, appId, email: "relay@a6n.ai", kind: "sender", canSend: true })
    .onConflictDoUpdate({ target: address.email, set: { workspaceId, appId, canSend: true } });
}
