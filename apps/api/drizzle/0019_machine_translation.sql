ALTER TABLE "parts" ADD COLUMN "name_en_machine_translated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "catalog_note_en" text;--> statement-breakpoint
ALTER TABLE "tavole" ADD COLUMN "name_en_machine_translated" boolean DEFAULT false NOT NULL;