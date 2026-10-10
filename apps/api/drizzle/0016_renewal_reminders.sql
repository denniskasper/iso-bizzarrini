ALTER TABLE "club" ADD COLUMN "reminders_on" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "treasurer_email" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "treasurer_digest_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "reminder_sent_at" timestamp with time zone;