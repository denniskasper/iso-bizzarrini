CREATE TABLE "reading_doubts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tavola_id" uuid NOT NULL,
	"listing_id" uuid,
	"position_id" uuid,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "table_sheet" integer;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "quarter_turns" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_doubts" ADD CONSTRAINT "reading_doubts_tavola_id_tavole_id_fk" FOREIGN KEY ("tavola_id") REFERENCES "tavole"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_doubts" ADD CONSTRAINT "reading_doubts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_doubts" ADD CONSTRAINT "reading_doubts_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_doubts_tavola_id_index" ON "reading_doubts" USING btree ("tavola_id");--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_quarter_turns_within_a_turn" CHECK ("scans"."quarter_turns" between 0 and 3);