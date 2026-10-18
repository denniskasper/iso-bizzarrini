CREATE TABLE "catalog_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"model_id" uuid NOT NULL,
	"state" text NOT NULL,
	"catalog_key" text NOT NULL,
	"catalog_byte_size" integer NOT NULL,
	"catalog_pages" integer NOT NULL,
	"first_page" integer NOT NULL,
	"last_page" integer NOT NULL,
	"reading_method" text NOT NULL,
	"charged" boolean NOT NULL,
	"priced_model" text NOT NULL,
	"prices_checked_on" text NOT NULL,
	"estimate" double precision NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	CONSTRAINT "catalog_runs_state_is_known" CHECK ("catalog_runs"."state" in ('estimated')),
	CONSTRAINT "catalog_runs_pages_run_forwards" CHECK (1 <= "catalog_runs"."first_page" and "catalog_runs"."first_page" <= "catalog_runs"."last_page" and "catalog_runs"."last_page" <= "catalog_runs"."catalog_pages")
);
--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD CONSTRAINT "catalog_runs_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD CONSTRAINT "catalog_runs_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_runs_model_id_index" ON "catalog_runs" USING btree ("model_id");