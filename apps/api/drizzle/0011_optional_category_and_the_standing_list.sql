ALTER TABLE "tavole" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
-- The Club's own list of the systems of a car, which every archive starts with. Written here
-- rather than seeded, so the real archive has it too; an Administrator adds to it and renames
-- what is on it from then on. A name already on the list, under any spelling, is left alone.
-- `src/catalog/standing-categories.ts` holds the same thirteen and a test keeps the two agreed.
INSERT INTO "categories" ("name", "slug") VALUES
	('Drive Shafts', 'drive-shafts'),
	('Differential', 'differential'),
	('Wheels', 'wheels'),
	('Front and Rear Suspension', 'front-and-rear-suspension'),
	('Anti-Roll Bar', 'anti-roll-bar'),
	('Steering', 'steering'),
	('Brakes', 'brakes'),
	('Electrical', 'electrical'),
	('Exhaust', 'exhaust'),
	('Cooling', 'cooling'),
	('Fuel', 'fuel'),
	('Body/Exterior', 'body-exterior'),
	('Interior', 'interior')
ON CONFLICT ("slug") DO NOTHING;
