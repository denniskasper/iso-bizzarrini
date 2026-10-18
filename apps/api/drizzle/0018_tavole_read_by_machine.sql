CREATE TABLE "table_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tavola_id" uuid NOT NULL,
	"sheet" integer NOT NULL,
	"format" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"original_key" text NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	CONSTRAINT "table_sheets_tavola_id_sheet_unique" UNIQUE("tavola_id","sheet"),
	CONSTRAINT "table_sheets_count_from_one" CHECK ("table_sheets"."sheet" > 0)
);
--> statement-breakpoint
ALTER TABLE "tavole" ADD COLUMN "reading_method" text;--> statement-breakpoint
ALTER TABLE "table_sheets" ADD CONSTRAINT "table_sheets_tavola_id_tavole_id_fk" FOREIGN KEY ("tavola_id") REFERENCES "tavole"("id") ON DELETE cascade ON UPDATE no action;