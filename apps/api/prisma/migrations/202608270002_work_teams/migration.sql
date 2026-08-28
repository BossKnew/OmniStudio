CREATE TABLE "WorkTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTeam_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkTeam_name_key" ON "WorkTeam"("name");

CREATE TABLE "WorkTeamMembership" (
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTeamMembership_pkey" PRIMARY KEY ("userId","teamId")
);

CREATE INDEX "WorkTeamMembership_teamId_idx" ON "WorkTeamMembership"("teamId");

ALTER TABLE "WorkTeamMembership" ADD CONSTRAINT "WorkTeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTeamMembership" ADD CONSTRAINT "WorkTeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "WorkTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetShare" DROP CONSTRAINT "AssetShare_groupId_fkey";
DELETE FROM "AssetShare";
ALTER TABLE "AssetShare" RENAME COLUMN "groupId" TO "teamId";
ALTER INDEX "AssetShare_assetId_groupId_key" RENAME TO "AssetShare_assetId_teamId_key";
ALTER INDEX "AssetShare_groupId_createdAt_id_idx" RENAME TO "AssetShare_teamId_createdAt_id_idx";
ALTER TABLE "AssetShare" ADD CONSTRAINT "AssetShare_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "WorkTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
