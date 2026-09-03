CREATE TABLE "mailbox_conversation_tags" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"thread_id" text NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "mailbox_conversation_tags_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_conversation_tags_thread_slug_unique" ON "mailbox_conversation_tags" USING btree ("thread_id","slug");--> statement-breakpoint
CREATE INDEX "mailbox_conversation_tags_thread_idx" ON "mailbox_conversation_tags" USING btree ("thread_id");
