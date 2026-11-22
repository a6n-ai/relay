import { baseColumns } from "@foundry/database";
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { member, organization, team } from "./organization";
import { tenantMailboxes } from "./mailboxes";

/** Who may see a catalog mailbox's letters: one member or one team, never both. */
export const mailboxGrant = pgTable("mailbox_grant", {
  ...baseColumns("mgr"),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  mailboxId: bigint("mailbox_id", { mode: "bigint" })
    .notNull()
    .references(() => tenantMailboxes.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => member.id, { onDelete: "cascade" }),
}, (t) => [
  check("mailbox_grant_one_grantee", sql`(${t.teamId} is null) <> (${t.memberId} is null)`),
  uniqueIndex("mailbox_grant_mailbox_team_unique")
    .on(t.mailboxId, t.teamId)
    .where(sql`${t.teamId} is not null`),
  uniqueIndex("mailbox_grant_mailbox_member_unique")
    .on(t.mailboxId, t.memberId)
    .where(sql`${t.memberId} is not null`),
  index("mailbox_grant_organization_id_idx").on(t.organizationId),
]);
