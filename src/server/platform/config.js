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

function createPlatformConfig() {
  const rootDir = path.resolve(__dirname, '../../..');
  const storeProvider = readString('GPP_STORE_PROVIDER', 'memory').toLowerCase();
  return Object.freeze({
    appVersion: readString('GPP_APP_VERSION', ''),
    auth: {
      issuer: readString('GPP_AUTH_ISSUER', 'galaxy-power-party'),
      accessTokenSecret: readString('GPP_ACCESS_TOKEN_SECRET', 'gpp-dev-access-secret'),
      refreshTokenSecret: readString('GPP_REFRESH_TOKEN_SECRET', 'gpp-dev-refresh-secret'),
      accessTtlSeconds: readPositiveInt('GPP_ACCESS_TTL_SECONDS', 60 * 60),
      refreshTtlSeconds: readPositiveInt('GPP_REFRESH_TTL_SECONDS', 60 * 60 * 24 * 14),
      passwordScryptCost: readPositiveInt('GPP_PASSWORD_SCRYPT_COST', 16384),
    },
    database: {
      provider: storeProvider,
      url: readString('DATABASE_URL', ''),
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
