CREATE TABLE "photographs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
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
	"uploaded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "photographs_sequence_is_a_place" CHECK ("photographs"."sequence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "photographs" ADD CONSTRAINT "photographs_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photographs_part_id_sequence_index" ON "photographs" USING btree ("part_id","sequence");