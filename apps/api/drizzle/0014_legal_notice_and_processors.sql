CREATE TABLE "processors" (
	"role" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"agreement_signed_on" date,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "processor_role_is_known" CHECK ("processors"."role" in ('hosting', 'storage', 'email', 'payment', 'error-tracking'))
);
--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "postal_address" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "represented_by" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "register_court" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "register_number" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "vat_id" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "legal_notice_further" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "data_protection_contact" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "data_protection_email" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "supervisory_authority" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "privacy_further" text;