CREATE TABLE "samples" (
	"tavola_id" uuid PRIMARY KEY NOT NULL,
	"position_id" uuid NOT NULL,
	"marked_at" timestamp with time zone NOT NULL,
	"marked_by" uuid,
	"drawing_id" uuid NOT NULL,
	"drawing_key" text NOT NULL,
	"drawing_width" integer NOT NULL,
	"drawing_height" integer NOT NULL,
	"drawing_byte_size" integer NOT NULL,
	CONSTRAINT "samples_drawing_id_unique" UNIQUE("drawing_id")
);
--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_tavola_id_tavole_id_fk" FOREIGN KEY ("tavola_id") REFERENCES "tavole"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_marked_by_accounts_id_fk" FOREIGN KEY ("marked_by") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "samples_position_id_index" ON "samples" USING btree ("position_id");