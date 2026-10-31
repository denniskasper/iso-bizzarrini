CREATE TABLE "proposal_screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"turn_id" uuid,
	"sequence" integer NOT NULL,
	"note" text,
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
	CONSTRAINT "proposal_screenshots_one_a_place" UNIQUE("proposal_id","sequence"),
	CONSTRAINT "proposal_screenshots_sequence_is_a_place" CHECK ("proposal_screenshots"."sequence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "proposal_screenshots" ADD CONSTRAINT "proposal_screenshots_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_screenshots" ADD CONSTRAINT "proposal_screenshots_turn_id_proposal_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "proposal_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposal_screenshots_turn_id_index" ON "proposal_screenshots" USING btree ("turn_id");