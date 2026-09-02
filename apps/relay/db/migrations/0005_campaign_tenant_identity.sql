ALTER TABLE "campaign_tenant" DROP CONSTRAINT "campaign_tenant_pkey";--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD COLUMN "id" bigint;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD COLUMN "public_id" text;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD COLUMN "app_id" bigint;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD COLUMN "created_at" bigint;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD COLUMN "created_by" bigint;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD COLUMN "updated_at" bigint;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD COLUMN "updated_by" bigint;--> statement-breakpoint
UPDATE "campaign_tenant" SET
	"id" = next_id(),
	"public_id" = 'ctn_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
	"app_id" = current_app_id(),
	"created_at" = (extract(epoch from now()) * 1000)::bigint,
	"updated_at" = (extract(epoch from now()) * 1000)::bigint
WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ALTER COLUMN "id" SET DEFAULT next_id();--> statement-breakpoint
ALTER TABLE "campaign_tenant" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ALTER COLUMN "app_id" SET DEFAULT current_app_id();--> statement-breakpoint
ALTER TABLE "campaign_tenant" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD CONSTRAINT "campaign_tenant_public_id_unique" UNIQUE ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_tenant_campaign_id_unique" ON "campaign_tenant" USING btree ("campaign_id");
