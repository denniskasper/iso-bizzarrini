CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"tavola_id" uuid NOT NULL,
	"position_id" uuid,
	"quantity_per_car" integer,
	"drawn" boolean DEFAULT true NOT NULL,
	CONSTRAINT "listings_part_id_tavola_id_position_id_unique" UNIQUE("part_id","tavola_id","position_id"),
	CONSTRAINT "listings_quantity_is_a_count" CHECK ("listings"."quantity_per_car" is null or "listings"."quantity_per_car" > 0)
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text,
	"name_it" text,
	"catalog_number" text,
	"disegno_origine" text,
	"description" text,
	"dimensions" text,
	"material_finish" text,
	"catalog_note" text,
	"note" text,
	CONSTRAINT "parts_catalog_number_unique" UNIQUE("catalog_number"),
	CONSTRAINT "parts_have_a_name" CHECK ("parts"."name_en" is not null or "parts"."name_it" is not null)
);
--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_tavola_id_tavole_id_fk" FOREIGN KEY ("tavola_id") REFERENCES "tavole"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_tavola_id_index" ON "listings" USING btree ("tavola_id");--> statement-breakpoint
CREATE INDEX "listings_position_id_index" ON "listings" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "listings_part_id_index" ON "listings" USING btree ("part_id");