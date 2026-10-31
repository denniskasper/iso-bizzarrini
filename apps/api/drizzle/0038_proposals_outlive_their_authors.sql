ALTER TABLE "proposals" DROP CONSTRAINT "proposals_author_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_author_id_accounts_id_fk" FOREIGN KEY ("author_id") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;