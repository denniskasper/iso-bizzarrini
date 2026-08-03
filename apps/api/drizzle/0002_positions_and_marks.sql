CREATE TABLE "marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tavola_id" uuid NOT NULL,
	"number" text NOT NULL,
	"number_sort" integer,
	CONSTRAINT "positions_tavola_id_number_unique" UNIQUE("tavola_id","number")
);
--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_tavola_id_tavole_id_fk" FOREIGN KEY ("tavola_id") REFERENCES "tavole"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marks_position_id_index" ON "marks" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "positions_tavola_id_index" ON "positions" USING btree ("tavola_id");