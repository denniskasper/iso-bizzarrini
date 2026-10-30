ALTER TABLE "photographs" ALTER COLUMN "part_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "photographs" ADD COLUMN "sub_assembly_id" uuid;--> statement-breakpoint
ALTER TABLE "photographs" ADD CONSTRAINT "photographs_sub_assembly_id_sub_assemblies_id_fk" FOREIGN KEY ("sub_assembly_id") REFERENCES "sub_assemblies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photographs_sub_assembly_id_sequence_index" ON "photographs" USING btree ("sub_assembly_id","sequence");--> statement-breakpoint
ALTER TABLE "photographs" ADD CONSTRAINT "photographs_belong_to_one_owner" CHECK (num_nonnulls("photographs"."part_id", "photographs"."sub_assembly_id") = 1);