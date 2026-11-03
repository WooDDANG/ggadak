ALTER TABLE "User" ADD COLUMN "guildsDirty" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Membership" ADD COLUMN "guildRevision" INTEGER NOT NULL DEFAULT -1;
CREATE TABLE "GuildAccessControl" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "streamId" TEXT,
  "lastSequence" INTEGER NOT NULL DEFAULT 0,
  "connected" BOOLEAN NOT NULL DEFAULT false,
  "membersIntent" BOOLEAN NOT NULL DEFAULT false,
  "leaseUntil" DATETIME
);
CREATE TABLE "GuildAccessObservation" (
  "guildId" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "installed" TEXT NOT NULL DEFAULT 'unknown',
  "available" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "GuildAccessRemoval" (
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  PRIMARY KEY ("guildId", "userId")
);
