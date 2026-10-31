ALTER TABLE "proposals" ADD COLUMN "summary" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "decline_reason" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "handed_over_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_handed_over_has_a_summary" CHECK ("proposals"."status" = 'draft' or ("proposals"."summary" is not null and "proposals"."handed_over_at" is not null));--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_declined_has_a_reason" CHECK (("proposals"."status" = 'declined') = ("proposals"."decline_reason" is not null));