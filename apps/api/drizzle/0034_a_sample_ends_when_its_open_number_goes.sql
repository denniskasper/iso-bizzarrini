CREATE TABLE "ended_samples" (
	"tavola_id" uuid PRIMARY KEY NOT NULL,
	"open_number" text NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "ended_samples_reason_is_known" CHECK ("ended_samples"."reason" in ('removed'))
);
--> statement-breakpoint
ALTER TABLE "ended_samples" ADD CONSTRAINT "ended_samples_tavola_id_tavole_id_fk" FOREIGN KEY ("tavola_id") REFERENCES "tavole"("id") ON DELETE cascade ON UPDATE no action;