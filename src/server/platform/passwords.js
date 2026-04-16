const { randomBytes, scryptSync, timingSafeEqual } = require('crypto');

function hashPassword(password, options = {}) {
  const safePassword = typeof password === 'string' ? password : '';
  const salt = options.salt || randomBytes(16).toString('hex');
  const cost = Number.isInteger(options.cost) ? options.cost : 16384;
  const digest = scryptSync(safePassword, salt, 64, { N: cost }).toString('hex');
  return {
    salt,
    digest,
    algorithm: 'scrypt',
    cost,
  };
}

function verifyPassword(password, stored, options = {}) {
  if (!stored || typeof stored.digest !== 'string' || typeof stored.salt !== 'string') {
    return false;
  }
  const hashed = hashPassword(password, {
    salt: stored.salt,
    cost: Number.isInteger(stored.cost) ? stored.cost : options.cost,
  });
  try {
    return timingSafeEqual(Buffer.from(hashed.digest, 'hex'), Buffer.from(stored.digest, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
};
