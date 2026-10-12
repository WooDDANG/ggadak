CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, "username" TEXT NOT NULL, "avatar" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "Guild" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "icon" TEXT);
-- Preserve existing server associations, including servers not visited through OAuth yet.
INSERT INTO "Guild" ("id", "name") SELECT DISTINCT "guildId", "guildId" FROM "Decision";
CREATE TABLE "Membership" ("userId" TEXT NOT NULL, "guildId" TEXT NOT NULL, "owner" BOOLEAN NOT NULL DEFAULT false, "permissions" TEXT NOT NULL DEFAULT '0', "refreshedAt" DATETIME NOT NULL, PRIMARY KEY ("userId", "guildId"), CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "Membership_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "AuthSession" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "refreshToken" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL, "refreshedAt" DATETIME NOT NULL, CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE TABLE "OAuthState" ("nonce" TEXT NOT NULL PRIMARY KEY, "expiresAt" DATETIME NOT NULL);
