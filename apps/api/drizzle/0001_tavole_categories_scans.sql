CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tavola_id" uuid NOT NULL,
	"source_format" text NOT NULL,
	"source_byte_size" integer NOT NULL,
	"source_width" integer NOT NULL,
	"source_height" integer NOT NULL,
	"display_format" text NOT NULL,
	"display_byte_size" integer NOT NULL,
	"display_width" integer NOT NULL,
	"display_height" integer NOT NULL,
	"preview_byte_size" integer NOT NULL,
	"original_key" text NOT NULL,
	"display_key" text NOT NULL,
	"preview_key" text NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scans_tavola_id_unique" UNIQUE("tavola_id")
);
--> statement-breakpoint
CREATE TABLE "tavole" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"number" text NOT NULL,
	"number_sort" integer,
	"name_it" text NOT NULL,
	"name_en" text NOT NULL,
	"category_id" uuid NOT NULL,
	"catalog_section" text,
	"catalog_group" text,
	"catalog_subgroup" text,
	CONSTRAINT "tavole_model_id_number_unique" UNIQUE("model_id","number")
);
--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_tavola_id_tavole_id_fk" FOREIGN KEY ("tavola_id") REFERENCES "tavole"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tavole" ADD CONSTRAINT "tavole_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tavole" ADD CONSTRAINT "tavole_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tavole_model_id_index" ON "tavole" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "tavole_category_id_index" ON "tavole" USING btree ("category_id");