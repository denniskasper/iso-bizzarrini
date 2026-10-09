CREATE TABLE "contribution_photographs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contribution_id" uuid NOT NULL,
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
	CONSTRAINT "contribution_photographs_sequence_is_a_place" CHECK ("contribution_photographs"."sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid,
	"position_id" uuid,
	"author_id" uuid,
	"body" text NOT NULL,
	"correction" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"written_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contributions_target_is_a_part_or_a_position" CHECK (num_nonnulls("contributions"."part_id", "contributions"."position_id") = 1),
	CONSTRAINT "contributions_correction_is_about_a_part" CHECK (not "contributions"."correction" or "contributions"."part_id" is not null),
	CONSTRAINT "contributions_state_is_one_of_three" CHECK ("contributions"."state" in ('waiting', 'published', 'discarded'))
);
--> statement-breakpoint
ALTER TABLE "contribution_photographs" ADD CONSTRAINT "contribution_photographs_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_author_id_accounts_id_fk" FOREIGN KEY ("author_id") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_photographs_contribution_id_sequence_index" ON "contribution_photographs" USING btree ("contribution_id","sequence");--> statement-breakpoint
CREATE INDEX "contributions_part_id_index" ON "contributions" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "contributions_position_id_index" ON "contributions" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "contributions_author_id_index" ON "contributions" USING btree ("author_id");