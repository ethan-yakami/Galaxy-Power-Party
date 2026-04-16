const { randomUUID } = require('crypto');

const { createPlatformConfig } = require('./config');
const { hashPassword, verifyPassword } = require('./passwords');
const {
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('./tokens');
const { createMetricsRegistry } = require('./metrics');
const { createStore } = require('./store');

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function buildUserProfile(user) {
  return {
    id: user.id,
    username: user.displayName || user.username,
    usernameNormalized: user.username,
    capabilities: ['account', 'replays'],
  };
}

function summarizeRoom(room) {
  if (!room) return null;
  return {
    code: room.code,
    status: room.status,
    roomMode: room.roomMode || 'standard',
    playerCount: Array.isArray(room.players) ? room.players.length : 0,
    players: Array.isArray(room.players)
      ? room.players.map((player) => ({
          id: player.id,
          name: player.name,
          userId: player.userId || null,
          isOnline: player.isOnline !== false,
          isAi: !!(player.ws && player.ws.isAI),
          characterId: player.characterId || null,
          auroraDiceId: player.auroraDiceId || null,
        }))
      : [],
    hasReplay: !!room.replay,
    replayId: room.replay && room.replay.replayId ? room.replay.replayId : null,
    lastActiveAt: room.lastActiveAt || null,
  };
}

function createPlatform({ rooms, logger, packageMeta, protocolVersion, replayVersion }) {
  const config = createPlatformConfig();
  const store = createStore(config.database);
  const metrics = createMetricsRegistry({ rooms });

  async function issueSessionTokens(user, meta = {}) {
    const sessionId = randomUUID();
    const refreshToken = issueRefreshToken({
      userId: user.id,
      sessionId,
      config: config.auth,
    });
    const finalSession = await store.createSession({
      id: sessionId,
      userId: user.id,
      refreshToken,
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt: Date.now() + (config.auth.refreshTtlSeconds * 1000),
    });
    const accessToken = issueAccessToken({
      userId: user.id,
      sessionId: finalSession.id,
      config: config.auth,
      capabilities: ['account', 'replays'],
    });
    return {
      user: buildUserProfile(user),
      accessToken,
      refreshToken,
      sessionId: finalSession.id,
    };
  }

  async function authenticateAccessToken(token) {
    const verified = verifyAccessToken(token, config.auth);
    if (!verified.ok) return { ok: false, reason: verified.reason };
    const session = await store.getSessionById(verified.payload.sid);
    if (!session || session.revokedAt || session.userId !== verified.payload.sub) {
      return { ok: false, reason: 'session_not_found' };
    }
    const user = await store.getUserById(verified.payload.sub);
    if (!user) return { ok: false, reason: 'user_not_found' };
    return {
      ok: true,
      user,
      session,
      profile: buildUserProfile(user),
    };
  }

  return Object.freeze({
    config,
    metrics,
    store,
    versionInfo: Object.freeze({
      appVersion: config.appVersion || packageMeta.version || '0.0.0',
      protocolVersion,
      replayVersion,
    }),
    async registerAccount({ username, password, userAgent, ip }) {
      const safeUsername = normalizeUsername(username);
      if (!safeUsername || safeUsername.length < 3) {
        return { ok: false, reason: 'invalid_username' };
      }
      if (typeof password !== 'string' || password.length < 6) {
        return { ok: false, reason: 'invalid_password' };
      }
      const existing = await store.findUserByUsername(safeUsername);
      if (existing) {
        metrics.inc('gpp_auth_failures_total', { reason: 'username_taken' });
        return { ok: false, reason: 'username_taken' };
      }
      const hashed = hashPassword(password, { cost: config.auth.passwordScryptCost });
      const user = await store.createUser({
        username: safeUsername,
        passwordDigest: hashed.digest,
        passwordSalt: hashed.salt,
        passwordCost: hashed.cost,
      });
      await store.addAuditEvent({
        kind: 'auth.register',
        userId: user.id,
        payload: { username: user.username },
      });
      logger.info('auth_register_success', { userId: user.id, username: user.username });
      return { ok: true, ...(await issueSessionTokens(user, { userAgent, ip })) };
    },
    async loginAccount({ username, password, userAgent, ip }) {
      const safeUsername = normalizeUsername(username);
      const user = await store.findUserByUsername(safeUsername);
      if (!user || !verifyPassword(password, {
        digest: user.passwordDigest,
        salt: user.passwordSalt,
        cost: user.passwordCost,
      })) {
        metrics.inc('gpp_auth_failures_total', { reason: 'invalid_credentials' });
        return { ok: false, reason: 'invalid_credentials' };
      }
      await store.addAuditEvent({
        kind: 'auth.login',
        userId: user.id,
        payload: { username: user.username },
      });
      logger.info('auth_login_success', { userId: user.id, username: user.username });
      return { ok: true, ...(await issueSessionTokens(user, { userAgent, ip })) };
    },
    async refreshSession({ refreshToken }) {
      const verified = verifyRefreshToken(refreshToken, config.auth);
      if (!verified.ok) {
        metrics.inc('gpp_auth_failures_total', { reason: verified.reason || 'invalid_refresh' });
        return { ok: false, reason: verified.reason || 'invalid_refresh' };
      }
      const session = await store.getSessionByRefreshToken(refreshToken);
      if (!session || session.revokedAt || session.id !== verified.payload.sid) {
        metrics.inc('gpp_auth_failures_total', { reason: 'refresh_session_not_found' });
        return { ok: false, reason: 'refresh_session_not_found' };
      }
      if (Number.isFinite(session.expiresAt) && session.expiresAt < Date.now()) {
        metrics.inc('gpp_auth_failures_total', { reason: 'refresh_session_expired' });
        return { ok: false, reason: 'refresh_session_expired' };
      }
      const user = await store.getUserById(session.userId);
      if (!user) {
        return { ok: false, reason: 'user_not_found' };
      }
      const accessToken = issueAccessToken({
        userId: user.id,
        sessionId: session.id,
        config: config.auth,
        capabilities: ['account', 'replays'],
      });
      await store.addAuditEvent({
        kind: 'auth.refresh',
        userId: user.id,
        sessionId: session.id,
      });
      return {
        ok: true,
        user: buildUserProfile(user),
        accessToken,
      };
    },
    async logout({ refreshToken, accessToken }) {
      let sessionId = '';
      if (typeof refreshToken === 'string' && refreshToken) {
        const session = await store.getSessionByRefreshToken(refreshToken);
        if (session) sessionId = session.id;
      }
      if (!sessionId && typeof accessToken === 'string' && accessToken) {
        const verified = verifyAccessToken(accessToken, config.auth);
        if (verified.ok) sessionId = verified.payload.sid;
      }
      if (!sessionId) {
        return { ok: false, reason: 'session_not_found' };
      }
      await store.revokeSession(sessionId);
      await store.addAuditEvent({
        kind: 'auth.logout',
        sessionId,
      });
      return { ok: true };
    },
    authenticateAccessToken,
    async persistReplayExport({ userId, room, replay, requestId }) {
      if (!userId || !replay) {
        return { ok: false, reason: 'anonymous_or_missing_replay' };
      }
      const record = await store.saveReplayRecord({
        ownerUserId: userId,
        replay,
        sourceRoomMode: room && room.roomMode ? room.roomMode : '',
        roomCode: room && room.code ? room.code : '',
      });
      metrics.inc('gpp_replay_exports_total', { mode: room && room.roomMode ? room.roomMode : 'unknown' });
      await store.addAuditEvent({
        kind: 'replay.export',
        userId,
        roomCode: room && room.code ? room.code : null,
        payload: {
          replayId: record.replayId,
          requestId: requestId || null,
        },
      });
      return { ok: true, record };
    },
    async listUserReplays(userId) {
      return store.listReplayRecordsByUser(userId, config.replays.listLimit);
    },
    async getUserReplay(userId, replayId) {
      const item = await store.getReplayRecordByIdForUser(userId, replayId);
      if (!item) return null;
      let replay = null;
      if (item.payload && typeof item.payload === 'object') {
        replay = item.payload;
      } else if (typeof item.payloadJson === 'string' && item.payloadJson) {
        try {
          replay = JSON.parse(item.payloadJson);
        } catch {
          replay = null;
        }
      }
      return {
        replayId: item.replayId,
        ownerUserId: item.ownerUserId,
        version: item.version || '',
        sourceRoomMode: item.sourceRoomMode || '',
        roomCode: item.roomCode || '',
        createdAt: item.createdAt,
        replay,
      };
    },
    async cleanupExpiredSessions() {
      if (typeof store.cleanupExpiredSessions !== 'function') return 0;
      return store.cleanupExpiredSessions(Date.now());
    },
    async buildRoomDiagnostics(roomCode) {
      if (roomCode) {
        const room = rooms.get(String(roomCode));
        return {
          ok: !!room,
          room: summarizeRoom(room),
        };
      }
      return {
        ok: true,
        rooms: Array.from(rooms.values()).map((room) => summarizeRoom(room)),
      };
    },
  });
}

module.exports = {
  createPlatform,
};
