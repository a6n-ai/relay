CREATE TABLE "mailbox_grant" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"organization_id" text NOT NULL,
	"mailbox_id" bigint NOT NULL,
	"team_id" text,
	"member_id" text,
	CONSTRAINT "mailbox_grant_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "mailbox_grant_one_grantee" CHECK (("mailbox_grant"."team_id" is null) <> ("mailbox_grant"."member_id" is null))
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "mailbox_grant" ADD CONSTRAINT "mailbox_grant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_grant" ADD CONSTRAINT "mailbox_grant_mailbox_id_tenant_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."tenant_mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_grant" ADD CONSTRAINT "mailbox_grant_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_grant" ADD CONSTRAINT "mailbox_grant_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_grant_mailbox_team_unique" ON "mailbox_grant" USING btree ("mailbox_id","team_id") WHERE "mailbox_grant"."team_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_grant_mailbox_member_unique" ON "mailbox_grant" USING btree ("mailbox_id","member_id") WHERE "mailbox_grant"."member_id" is not null;--> statement-breakpoint
CREATE INDEX "mailbox_grant_organization_id_idx" ON "mailbox_grant" USING btree ("organization_id");