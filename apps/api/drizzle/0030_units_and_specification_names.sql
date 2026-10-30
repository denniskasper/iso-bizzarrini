CREATE TABLE "specification_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"unit_id" uuid,
	"sequence" integer NOT NULL,
	CONSTRAINT "specification_names_slug_unique" UNIQUE("slug"),
	CONSTRAINT "specification_names_sequence_is_a_place" CHECK ("specification_names"."sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "specifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"name_id" uuid NOT NULL,
	"value_number" numeric,
	"value_text" text,
	CONSTRAINT "specifications_one_per_part_and_name" UNIQUE("part_id","name_id"),
	CONSTRAINT "specifications_one_value" CHECK (("specifications"."value_number" is null) <> ("specifications"."value_text" is null))
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"key" text NOT NULL,
	CONSTRAINT "units_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "specification_names" ADD CONSTRAINT "specification_names_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_name_id_specification_names_id_fk" FOREIGN KEY ("name_id") REFERENCES "specification_names"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "specifications_name_id_index" ON "specifications" USING btree ("name_id");--> statement-breakpoint
-- The Units a car's parts are usually measured in, and the names restorers record most, which
-- every archive starts with. Written here rather than seeded, so the real archive has them too;
-- an Administrator adds to both lists, renames, reorders and removes from then on.
-- `src/catalog/standing-specifications.ts` holds the same lists and a test keeps the two agreed.
INSERT INTO "units" ("symbol", "key") VALUES
	('g', 'g'),
	('kg', 'kg'),
	('mm', 'mm'),
	('cm', 'cm'),
	('m', 'm'),
	('Nm', 'Nm'),
	('kgm', 'kgm'),
	('bar', 'bar'),
	('V', 'V'),
	('A', 'A'),
	('W', 'W'),
	('Ω', 'Ω'),
	('l', 'l'),
	('ml', 'ml'),
	('°', '°'),
	('°C', '°C')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "specification_names" ("name", "slug", "unit_id", "sequence") VALUES
	('Material', 'material', NULL, 0),
	('Colour/finish', 'colour-finish', NULL, 1),
	('Length', 'length', (SELECT "id" FROM "units" WHERE "key" = 'mm'), 2),
	('Width', 'width', (SELECT "id" FROM "units" WHERE "key" = 'mm'), 3),
	('Height', 'height', (SELECT "id" FROM "units" WHERE "key" = 'mm'), 4),
	('Diameter', 'diameter', (SELECT "id" FROM "units" WHERE "key" = 'mm'), 5),
	('Thread', 'thread', NULL, 6),
	('Weight', 'weight', (SELECT "id" FROM "units" WHERE "key" = 'g'), 7)
ON CONFLICT ("slug") DO NOTHING;
