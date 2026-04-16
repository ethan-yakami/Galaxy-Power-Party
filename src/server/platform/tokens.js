const { createHmac, randomBytes } = require('crypto');

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function signParts(header, payload, secret) {
  return createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signToken(payload, secret) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signParts(header, encodedPayload, secret);
  return `${header}.${encodedPayload}.${signature}`;
}

function verifySignedToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'malformed_token' };
  }
  const [header, payload, signature] = parts;
  const expected = signParts(header, payload, secret);
  if (signature !== expected) {
    return { ok: false, reason: 'invalid_signature' };
  }
  try {
    const decoded = JSON.parse(base64UrlDecode(payload));
    const now = Math.floor(Date.now() / 1000);
    if (Number.isInteger(decoded.exp) && decoded.exp < now) {
      return { ok: false, reason: 'token_expired' };
    }
    return { ok: true, payload: decoded };
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }
}

function issueAccessToken({ userId, sessionId, config, capabilities = [] }) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    iss: config.issuer,
    sub: userId,
    sid: sessionId,
    typ: 'access',
    capabilities,
    iat: now,
    exp: now + config.accessTtlSeconds,
    jti: randomBytes(10).toString('hex'),
  }, config.accessTokenSecret);
}

function issueRefreshToken({ userId, sessionId, config }) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    iss: config.issuer,
    sub: userId,
    sid: sessionId,
    typ: 'refresh',
    iat: now,
    exp: now + config.refreshTtlSeconds,
    jti: randomBytes(16).toString('hex'),
  }, config.refreshTokenSecret);
}

function verifyAccessToken(token, config) {
  const result = verifySignedToken(token, config.accessTokenSecret);
  if (!result.ok) return result;
  if (result.payload.typ !== 'access') {
    return { ok: false, reason: 'invalid_token_type' };
  }
  return result;
}

function verifyRefreshToken(token, config) {
  const result = verifySignedToken(token, config.refreshTokenSecret);
  if (!result.ok) return result;
  if (result.payload.typ !== 'refresh') {
    return { ok: false, reason: 'invalid_token_type' };
  }
  return result;
}

module.exports = {
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
