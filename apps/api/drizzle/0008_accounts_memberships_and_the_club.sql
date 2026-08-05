CREATE TABLE "account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "account_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "account_tokens_purpose_is_known" CHECK ("account_tokens"."purpose" in ('invitation', 'password-reset'))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"password_hash" text,
	"password_set_at" timestamp with time zone,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "accounts_role_is_one_of_three" CHECK ("accounts"."role" in ('member', 'editor', 'administrator'))
);
--> statement-breakpoint
CREATE TABLE "club" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fee" integer NOT NULL,
	"currency" text NOT NULL,
	"bank_account_holder" text,
	"bank_name" text,
	"iban" text,
	"bic" text,
	"payment_reference" text NOT NULL,
	"reminder_text" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "club_is_one_row" CHECK ("club"."id" = 1),
	CONSTRAINT "club_fee_is_an_amount" CHECK ("club"."fee" >= 0),
	CONSTRAINT "club_currency_is_tradeable" CHECK ("club"."currency" in ('EUR', 'USD', 'GBP', 'CHF'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"paid_through" date NOT NULL,
	"granted_by" text NOT NULL,
	"amount" integer,
	"currency" text,
	"received_on" date,
	"reference" text,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "memberships_granted_by_is_known" CHECK ("memberships"."granted_by" in ('opening-entry', 'bank-transfer')),
	CONSTRAINT "memberships_amount_is_an_amount" CHECK ("memberships"."amount" is null or "memberships"."amount" > 0),
	CONSTRAINT "memberships_currency_is_tradeable" CHECK ("memberships"."currency" is null or "memberships"."currency" in ('EUR', 'USD', 'GBP', 'CHF')),
	CONSTRAINT "memberships_amount_carries_its_currency" CHECK (("memberships"."amount" is null) = ("memberships"."currency" is null))
);
--> statement-breakpoint
CREATE TABLE "sign_in_failures" (
	"email" text PRIMARY KEY NOT NULL,
	"failures" integer NOT NULL,
	"first_failure_at" timestamp with time zone NOT NULL,
	"last_failure_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_recorded_by_accounts_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_tokens_account_id_purpose_index" ON "account_tokens" USING btree ("account_id","purpose");--> statement-breakpoint
CREATE INDEX "memberships_account_id_paid_through_index" ON "memberships" USING btree ("account_id","paid_through");