ALTER TABLE "Model" ADD COLUMN "costPerUnit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "QuotaEvent" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;
UPDATE "QuotaEvent" SET "points" = "imageCount" + "videoSeconds";
ALTER TABLE "UserGroup" ADD COLUMN "quotaPoints" INTEGER;
UPDATE "UserGroup" SET "quotaPoints" = COALESCE("quotaImages", 0) + COALESCE("quotaVideoSeconds", 0)
  WHERE "quotaImages" IS NOT NULL OR "quotaVideoSeconds" IS NOT NULL;
UPDATE "UserGroup" SET "quotaWindow" = "videoQuotaWindow"
  WHERE "quotaWindow" IS NULL AND "videoQuotaWindow" IS NOT NULL;
ALTER TABLE "UserGroup" DROP COLUMN "quotaImages";
ALTER TABLE "UserGroup" DROP COLUMN "videoQuotaWindow";
ALTER TABLE "UserGroup" DROP COLUMN "quotaVideoSeconds";
