ALTER TABLE "invitation" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
