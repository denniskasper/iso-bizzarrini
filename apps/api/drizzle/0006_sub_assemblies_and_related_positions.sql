CREATE TABLE "related_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"related_position_id" uuid NOT NULL,
	CONSTRAINT "related_positions_pair_unique" UNIQUE("position_id","related_position_id"),
	CONSTRAINT "related_positions_are_one_ordered_pair" CHECK ("related_positions"."position_id" < "related_positions"."related_position_id")
);
--> statement-breakpoint
CREATE TABLE "sub_assemblies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tavola_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "sub_assemblies_tavola_id_name_unique" UNIQUE("tavola_id","name")
);
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "sub_assembly_id" uuid;--> statement-breakpoint
ALTER TABLE "related_positions" ADD CONSTRAINT "related_positions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_positions" ADD CONSTRAINT "related_positions_related_position_id_positions_id_fk" FOREIGN KEY ("related_position_id") REFERENCES "positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_assemblies" ADD CONSTRAINT "sub_assemblies_tavola_id_tavole_id_fk" FOREIGN KEY ("tavola_id") REFERENCES "tavole"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "related_positions_position_id_index" ON "related_positions" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "related_positions_related_position_id_index" ON "related_positions" USING btree ("related_position_id");--> statement-breakpoint
CREATE INDEX "sub_assemblies_tavola_id_index" ON "sub_assemblies" USING btree ("tavola_id");--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_sub_assembly_id_sub_assemblies_id_fk" FOREIGN KEY ("sub_assembly_id") REFERENCES "sub_assemblies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "positions_sub_assembly_id_index" ON "positions" USING btree ("sub_assembly_id");