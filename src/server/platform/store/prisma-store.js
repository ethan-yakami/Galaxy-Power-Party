function createPrismaStore(config) {
  let PrismaClient = null;
  try {
    ({ PrismaClient } = require('@prisma/client'));
  } catch (error) {
    async function unavailable() {
      throw new Error(`prisma_client_missing:${error && error.message ? error.message : String(error)}`);
    }
    return {
      provider: 'prisma',
      async health() {
        return {
          ok: false,
          provider: 'prisma',
          reason: 'prisma_client_missing',
          message: error && error.message ? error.message : String(error),
        };
      },
      async ready() {
        return {
          ok: false,
          provider: 'prisma',
          reason: 'prisma_client_missing',
        };
      },
      createUser: unavailable,
      findUserByUsername: unavailable,
      getUserById: unavailable,
      createSession: unavailable,
      getSessionById: unavailable,
      getSessionByRefreshToken: unavailable,
      revokeSession: unavailable,
      saveReplayRecord: unavailable,
      listReplayRecordsByUser: unavailable,
      getReplayRecordByIdForUser: unavailable,
      addAuditEvent: unavailable,
      cleanupExpiredSessions: unavailable,
    };
  }

  const prisma = new PrismaClient({
    datasources: config && config.url ? { db: { url: config.url } } : undefined,
  });

  return Object.freeze({
    provider: 'prisma',
    async health() {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { ok: true, provider: 'prisma' };
      } catch (error) {
        return {
          ok: false,
          provider: 'prisma',
          reason: 'query_failed',
          message: error && error.message ? error.message : String(error),
        };
      }
    },
    async ready() {
      return this.health();
    },
    async createUser({ username, passwordDigest, passwordSalt, passwordCost }) {
      return prisma.user.create({
        data: {
          username: String(username || '').trim().toLowerCase(),
          displayName: username,
          passwordDigest,
          passwordSalt,
          passwordCost,
        },
      });
    },
    async findUserByUsername(username) {
      return prisma.user.findUnique({
        where: { username: String(username || '').trim().toLowerCase() },
      });
    },
    async getUserById(userId) {
      return prisma.user.findUnique({ where: { id: userId } });
    },
    async createSession({ id, userId, refreshToken, userAgent, ip, expiresAt }) {
      const { createHash } = require('crypto');
      return prisma.authSession.create({
        data: {
          id: id || undefined,
          userId,
          refreshTokenHash: createHash('sha256').update(String(refreshToken || '')).digest('hex'),
          userAgent: String(userAgent || ''),
          ip: String(ip || ''),
          expiresAt: new Date(expiresAt),
        },
      });
    },
    async getSessionById(sessionId) {
      return prisma.authSession.findUnique({ where: { id: sessionId } });
    },
    async getSessionByRefreshToken(refreshToken) {
      const { createHash } = require('crypto');
      return prisma.authSession.findFirst({
        where: {
          refreshTokenHash: createHash('sha256').update(String(refreshToken || '')).digest('hex'),
        },
      });
    },
    async revokeSession(sessionId) {
      await prisma.authSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      return true;
    },
    async saveReplayRecord({ ownerUserId, replay, sourceRoomMode, roomCode }) {
      return prisma.replayRecord.create({
        data: {
          replayId: replay && replay.replayId ? replay.replayId : undefined,
          ownerUserId,
          version: replay && replay.version ? replay.version : '',
          sourceRoomMode: sourceRoomMode || '',
          roomCode: roomCode || '',
          payloadJson: JSON.stringify(replay || {}),
        },
      });
    },
    async listReplayRecordsByUser(ownerUserId, limit = 50) {
      return prisma.replayRecord.findMany({
        where: { ownerUserId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          replayId: true,
          ownerUserId: true,
          version: true,
          createdAt: true,
          sourceRoomMode: true,
          roomCode: true,
        },
      });
    },
    async getReplayRecordByIdForUser(ownerUserId, replayId) {
      return prisma.replayRecord.findFirst({
        where: {
          ownerUserId,
          replayId: String(replayId || ''),
        },
      });
    },
    async addAuditEvent(event) {
      await prisma.auditEvent.create({
        data: {
          kind: event.kind || 'event',
          userId: event.userId || null,
          sessionId: event.sessionId || null,
          roomCode: event.roomCode || null,
          payloadJson: JSON.stringify(event || {}),
        },
      });
      return true;
    },
    async cleanupExpiredSessions(now = Date.now()) {
      const cutoff = new Date(now);
      const result = await prisma.authSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: cutoff } },
            { revokedAt: { not: null } },
          ],
        },
      });
      return result && Number.isInteger(result.count) ? result.count : 0;
    },
  });
}

module.exports = {
  createPrismaStore,
};
