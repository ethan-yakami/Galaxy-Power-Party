CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "User" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "username" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordDigest" TEXT NOT NULL,
  "passwordSalt" TEXT NOT NULL,
  "passwordCost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReplayRecord" (
  "replayId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "sourceRoomMode" TEXT NOT NULL,
  "roomCode" TEXT,
  "payloadJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplayRecord_pkey" PRIMARY KEY ("replayId")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "kind" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "roomCode" TEXT,
  "payloadJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReplayRecord"
ADD CONSTRAINT "ReplayRecord_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
