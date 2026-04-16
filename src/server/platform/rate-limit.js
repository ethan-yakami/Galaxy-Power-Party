function createWindowRateLimiter(options = {}) {
  const windowMs = Number.isInteger(options.windowMs) && options.windowMs > 0 ? options.windowMs : 60 * 1000;
  const max = Number.isInteger(options.max) && options.max > 0 ? options.max : 30;
  const banMs = Number.isInteger(options.banMs) && options.banMs > 0 ? options.banMs : 0;
  const buckets = new Map();

  function getBucket(key, now) {
    const safeKey = String(key || 'unknown');
    let bucket = buckets.get(safeKey);
    if (!bucket) {
      bucket = {
        count: 0,
        resetAt: now + windowMs,
        bannedUntil: 0,
      };
      buckets.set(safeKey, bucket);
      return bucket;
    }
    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    return bucket;
  }

  function consume(key, now = Date.now()) {
    const bucket = getBucket(key, now);
    if (bucket.bannedUntil > now) {
      return {
        ok: false,
        retryAfterMs: bucket.bannedUntil - now,
      };
    }

    bucket.count += 1;
    if (bucket.count <= max) {
      return {
        ok: true,
        remaining: Math.max(0, max - bucket.count),
        resetAt: bucket.resetAt,
      };
    }

    const retryAfterMs = Math.max(1, bucket.resetAt - now);
    if (banMs > 0) {
      bucket.bannedUntil = now + banMs;
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
      return {
        ok: false,
        retryAfterMs: banMs,
      };
    }
    return {
      ok: false,
      retryAfterMs,
    };
  }

  function prune(now = Date.now()) {
    for (const [key, bucket] of buckets.entries()) {
      const expired = bucket.resetAt + windowMs < now;
      const unbanned = bucket.bannedUntil <= now;
      if (expired && unbanned) {
        buckets.delete(key);
      }
    }
  }

  return Object.freeze({
    consume,
    prune,
  });
}

module.exports = {
  createWindowRateLimiter,
};
