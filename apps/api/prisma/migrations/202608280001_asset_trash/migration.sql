ALTER TABLE "Asset" ADD COLUMN "purgeAfter" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN "purgedAt" TIMESTAMP(3);

UPDATE "Asset"
SET "purgedAt" = "deletedAt", "purgeAfter" = "deletedAt"
WHERE "deletedAt" IS NOT NULL AND "purgedAt" IS NULL;

CREATE INDEX "Asset_userId_deletedAt_purgedAt_createdAt_id_idx" ON "Asset"("userId", "deletedAt", "purgedAt", "createdAt", "id");
CREATE INDEX "Asset_purgeAfter_purgedAt_idx" ON "Asset"("purgeAfter", "purgedAt");
