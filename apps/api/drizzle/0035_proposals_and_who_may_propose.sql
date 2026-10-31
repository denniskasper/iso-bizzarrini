CREATE TABLE "proposal_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"speaker" text NOT NULL,
	"text" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "proposal_turns_one_turn_a_place" UNIQUE("proposal_id","sequence"),
	CONSTRAINT "proposal_turns_sequence_is_a_place" CHECK ("proposal_turns"."sequence" >= 0),
	CONSTRAINT "proposal_turns_speaker_is_one_of_two" CHECK ("proposal_turns"."speaker" in ('author', 'conversation'))
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"page_address" text NOT NULL,
	"version" text NOT NULL,
	"model_id" uuid,
	"model_name" text,
	"tavola_id" uuid,
	"tavola_number" text,
	"tavola_name" text,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "proposals_kind_is_fix_or_idea" CHECK ("proposals"."kind" in ('fix', 'idea')),
	CONSTRAINT "proposals_status_is_one_of_five" CHECK ("proposals"."status" in ('draft', 'new', 'taken-up', 'done', 'declined')),
	CONSTRAINT "proposals_tavola_is_named_whole" CHECK (("proposals"."tavola_id" is null) = ("proposals"."tavola_number" is null))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "may_propose" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_turns" ADD CONSTRAINT "proposal_turns_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_author_id_accounts_id_fk" FOREIGN KEY ("author_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposals_author_id_index" ON "proposals" USING btree ("author_id");