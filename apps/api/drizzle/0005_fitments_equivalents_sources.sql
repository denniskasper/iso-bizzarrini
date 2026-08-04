CREATE TABLE "equivalents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"maker" text NOT NULL,
	"reference" text,
	"note" text,
	CONSTRAINT "equivalents_reference_unique" UNIQUE("part_id","kind","maker","reference"),
	CONSTRAINT "equivalents_kind_is_one_of_four" CHECK ("equivalents"."kind" in ('oe-supplier', 'oem', 'industry-standard', 'donor-vehicle'))
);
--> statement-breakpoint
CREATE TABLE "fitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"qualifier" text,
	CONSTRAINT "fitments_part_id_model_id_unique" UNIQUE("part_id","model_id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"condition" text,
	"price_amount" integer,
	"price_currency" text,
	"observed_on" date,
	"note" text,
	CONSTRAINT "sources_condition_is_one_of_three" CHECK ("sources"."condition" is null or "sources"."condition" in ('new-old-stock', 'used', 'reproduction')),
	CONSTRAINT "sources_currency_is_tradeable" CHECK ("sources"."price_currency" is null or "sources"."price_currency" in ('EUR', 'USD', 'GBP', 'CHF')),
	CONSTRAINT "sources_price_is_an_amount" CHECK ("sources"."price_amount" is null or "sources"."price_amount" > 0),
	CONSTRAINT "sources_price_carries_its_date" CHECK (("sources"."price_amount" is null and "sources"."price_currency" is null and "sources"."observed_on" is null)
       or ("sources"."price_amount" is not null and "sources"."price_currency" is not null and "sources"."observed_on" is not null))
);
--> statement-breakpoint
ALTER TABLE "equivalents" ADD CONSTRAINT "equivalents_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitments" ADD CONSTRAINT "fitments_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitments" ADD CONSTRAINT "fitments_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equivalents_unreferenced_unique" ON "equivalents" USING btree ("part_id","kind","maker") WHERE "equivalents"."reference" is null;--> statement-breakpoint
CREATE INDEX "equivalents_part_id_index" ON "equivalents" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "fitments_part_id_index" ON "fitments" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "sources_part_id_index" ON "sources" USING btree ("part_id");