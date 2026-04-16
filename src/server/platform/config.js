const path = require('path');

function readPositiveInt(name, fallbackValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallbackValue;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function readString(name, fallbackValue = '') {
  const raw = process.env[name];
  if (typeof raw !== 'string') return fallbackValue;
  const trimmed = raw.trim();
  return trimmed || fallbackValue;
}

function assertProductionSecret(name, value) {
  if (!value || value.length < 32 || value.includes('gpp-dev-')) {
    throw new Error(`${name} is required in production and must be a strong random secret (>=32 chars).`);
  }
}

function createPlatformConfig() {
  const rootDir = path.resolve(__dirname, '../../..');
  const nodeEnv = readString('NODE_ENV', 'development').toLowerCase();
  const isProduction = nodeEnv === 'production';
  const storeProvider = readString('GPP_STORE_PROVIDER', isProduction ? 'prisma' : 'memory').toLowerCase();
  const databaseUrl = readString('DATABASE_URL', '');
  const accessTokenSecret = readString('GPP_ACCESS_TOKEN_SECRET', isProduction ? '' : 'gpp-dev-access-secret');
  const refreshTokenSecret = readString('GPP_REFRESH_TOKEN_SECRET', isProduction ? '' : 'gpp-dev-refresh-secret');
  if (isProduction) {
    if (storeProvider !== 'prisma') {
      throw new Error('Production mode requires GPP_STORE_PROVIDER=prisma.');
    }
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required in production.');
    }
    assertProductionSecret('GPP_ACCESS_TOKEN_SECRET', accessTokenSecret);
    assertProductionSecret('GPP_REFRESH_TOKEN_SECRET', refreshTokenSecret);
  }
  return Object.freeze({
    appVersion: readString('GPP_APP_VERSION', ''),
    nodeEnv,
    auth: {
      issuer: readString('GPP_AUTH_ISSUER', 'galaxy-power-party'),
      accessTokenSecret,
      refreshTokenSecret,
      accessTtlSeconds: readPositiveInt('GPP_ACCESS_TTL_SECONDS', 60 * 60),
      refreshTtlSeconds: readPositiveInt('GPP_REFRESH_TTL_SECONDS', 60 * 60 * 24 * 14),
      passwordScryptCost: readPositiveInt('GPP_PASSWORD_SCRYPT_COST', 16384),
    },
    admin: {
      token: readString('GPP_ADMIN_TOKEN', ''),
    },
    security: {
      authRateLimitWindowMs: readPositiveInt('GPP_AUTH_RATE_LIMIT_WINDOW_MS', 60 * 1000),
      authRateLimitMax: readPositiveInt('GPP_AUTH_RATE_LIMIT_MAX', 20),
      authRateLimitBanMs: readPositiveInt('GPP_AUTH_RATE_LIMIT_BAN_MS', 5 * 60 * 1000),
      wsHandshakeWindowMs: readPositiveInt('GPP_WS_HANDSHAKE_RATE_LIMIT_WINDOW_MS', 60 * 1000),
      wsHandshakeMax: readPositiveInt('GPP_WS_HANDSHAKE_RATE_LIMIT_MAX', 30),
      wsHandshakeBanMs: readPositiveInt('GPP_WS_HANDSHAKE_RATE_LIMIT_BAN_MS', 2 * 60 * 1000),
      wsActionWindowMs: readPositiveInt('GPP_WS_ACTION_RATE_LIMIT_WINDOW_MS', 10 * 1000),
      wsActionMax: readPositiveInt('GPP_WS_ACTION_RATE_LIMIT_MAX', 24),
      wsActionBanMs: readPositiveInt('GPP_WS_ACTION_RATE_LIMIT_BAN_MS', 60 * 1000),
      roomCleanupIntervalMs: readPositiveInt('GPP_ROOM_CLEANUP_INTERVAL_MS', 30 * 1000),
      roomIdleTtlMs: readPositiveInt('GPP_ROOM_IDLE_TTL_MS', 30 * 60 * 1000),
      playerOfflineGraceMs: readPositiveInt('GPP_PLAYER_OFFLINE_GRACE_MS', 2 * 60 * 1000),
      sessionCleanupIntervalMs: readPositiveInt('GPP_SESSION_CLEANUP_INTERVAL_MS', 10 * 60 * 1000),
    },
    database: {
      provider: storeProvider,
      url: databaseUrl,
      prismaSchemaPath: path.join(rootDir, 'prisma', 'schema.prisma'),
    },
    replays: {
      listLimit: readPositiveInt('GPP_REPLAY_LIST_LIMIT', 50),
    },
  });
}

module.exports = {
  createPlatformConfig,
};
