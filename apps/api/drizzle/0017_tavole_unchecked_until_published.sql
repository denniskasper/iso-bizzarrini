ALTER TABLE "tavole" ADD COLUMN "state" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "tavole" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tavole" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "tavole" ADD CONSTRAINT "tavole_published_by_accounts_id_fk" FOREIGN KEY ("published_by") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tavole" ADD CONSTRAINT "tavole_state_is_one_of_two" CHECK ("tavole"."state" in ('unchecked', 'published'));--> statement-breakpoint
ALTER TABLE "tavole" ADD CONSTRAINT "tavole_an_unchecked_tavola_was_never_published" CHECK ("tavole"."state" = 'published' or "tavole"."published_at" is null);