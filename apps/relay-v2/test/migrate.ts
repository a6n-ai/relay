import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";

type MigrationBindings = { TEST_SECURITY_MIGRATIONS: D1Migration[]; TEST_CORE_MIGRATIONS: D1Migration[] };

export async function applyMigrations(): Promise<void> {
  const { TEST_SECURITY_MIGRATIONS, TEST_CORE_MIGRATIONS } = env as typeof env & MigrationBindings;
  await applyD1Migrations(env.SECURITY_DB, TEST_SECURITY_MIGRATIONS);
  await applyD1Migrations(env.CORE_DB, TEST_CORE_MIGRATIONS);
}
