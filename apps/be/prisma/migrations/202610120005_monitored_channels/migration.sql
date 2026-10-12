CREATE TABLE "MonitoredChannel" ("id" TEXT NOT NULL PRIMARY KEY, "guildId" TEXT NOT NULL, "name" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL, CONSTRAINT "MonitoredChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "MonitoredChannel_guildId_idx" ON "MonitoredChannel"("guildId");
