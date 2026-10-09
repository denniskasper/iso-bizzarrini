ALTER TABLE "memberships" DROP CONSTRAINT "memberships_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "payer_name" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_without_an_account_name_their_payer" CHECK ("memberships"."account_id" is not null or "memberships"."payer_name" is not null);