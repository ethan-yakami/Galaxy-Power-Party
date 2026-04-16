const { createHash, randomUUID } = require('crypto');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryStore() {
  const users = new Map();
  const usersByName = new Map();
  const sessions = new Map();
  const replayRecords = new Map();
  const auditEvents = [];

  function toReplaySummary(record) {
    return {
      replayId: record.replayId,
      ownerUserId: record.ownerUserId,
      version: record.version,
      createdAt: record.createdAt,
      sourceRoomMode: record.sourceRoomMode,
      roomCode: record.roomCode,
    };
  }

  return Object.freeze({
    provider: 'memory',
    async health() {
      return { ok: true, provider: 'memory' };
    },
    async ready() {
      return { ok: true, provider: 'memory' };
    },
    async createUser({ username, passwordDigest, passwordSalt, passwordCost }) {
      const normalizedUsername = String(username || '').trim().toLowerCase();
      if (usersByName.has(normalizedUsername)) {
        throw new Error('username_taken');
      }
      const user = {
        id: randomUUID(),
        username: normalizedUsername,
        displayName: username,
        passwordDigest,
        passwordSalt,
        passwordCost,
        createdAt: Date.now(),
      };
      users.set(user.id, user);
      usersByName.set(normalizedUsername, user.id);
      return clone(user);
    },
    async findUserByUsername(username) {
      const normalizedUsername = String(username || '').trim().toLowerCase();
      const userId = usersByName.get(normalizedUsername);
      return userId && users.has(userId) ? clone(users.get(userId)) : null;
    },
    async getUserById(userId) {
      return users.has(userId) ? clone(users.get(userId)) : null;
    },
    async createSession({ id, userId, refreshToken, userAgent, ip, expiresAt }) {
      const session = {
        id: id || randomUUID(),
        userId,
        refreshTokenHash: createHash('sha256').update(String(refreshToken || '')).digest('hex'),
        userAgent: String(userAgent || ''),
        ip: String(ip || ''),
        createdAt: Date.now(),
        expiresAt,
        revokedAt: null,
      };
      sessions.set(session.id, session);
      return clone(session);
    },
    async getSessionById(sessionId) {
      return sessions.has(sessionId) ? clone(sessions.get(sessionId)) : null;
    },
    async getSessionByRefreshToken(refreshToken) {
      const tokenHash = createHash('sha256').update(String(refreshToken || '')).digest('hex');
      for (const session of sessions.values()) {
        if (session.refreshTokenHash === tokenHash) {
          return clone(session);
        }
      }
      return null;
    },
    async revokeSession(sessionId) {
      const existing = sessions.get(sessionId);
      if (!existing) return false;
      existing.revokedAt = Date.now();
      return true;
    },
    async saveReplayRecord({ ownerUserId, replay, sourceRoomMode, roomCode }) {
      const replayId = replay && replay.replayId ? replay.replayId : randomUUID();
      const record = {
        replayId,
        ownerUserId,
        version: replay && replay.version ? replay.version : '',
        createdAt: Date.now(),
        sourceRoomMode: sourceRoomMode || '',
        roomCode: roomCode || '',
        payload: clone(replay),
      };
      replayRecords.set(replayId, record);
      return clone(record);
    },
    async listReplayRecordsByUser(ownerUserId, limit = 50) {
      return Array.from(replayRecords.values())
        .filter((record) => record.ownerUserId === ownerUserId)
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit)
        .map((record) => toReplaySummary(record));
    },
    async addAuditEvent(event) {
      auditEvents.push({
        id: randomUUID(),
        createdAt: Date.now(),
        ...clone(event),
      });
      return true;
    },
    async getAuditEvents(limit = 50) {
      return auditEvents.slice(-limit).map((event) => clone(event));
    },
  });
}

module.exports = {
  createMemoryStore,
};
