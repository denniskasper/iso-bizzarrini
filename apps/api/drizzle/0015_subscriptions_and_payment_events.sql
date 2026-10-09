CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"renews" boolean DEFAULT true NOT NULL,
	"renews_on" date,
	"ended_at" timestamp with time zone,
	"state_as_of" timestamp with time zone,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_granted_by_is_known";--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "provider_payment_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_account_id_index" ON "subscriptions" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_provider_payment_id_unique" UNIQUE("provider_payment_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_granted_by_is_known" CHECK ("memberships"."granted_by" in ('opening-entry', 'bank-transfer', 'roster-import', 'payment-provider'));