function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    let value = seed >>> 0;
    if (value === 0) value = 0x6d2b79f5;
    return value >>> 0;
  }

  const text = String(seed == null ? 'gpp' : seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  if (h === 0) h = 0x6d2b79f5;
  return h;
}

function nextUint32(state) {
  let value = state.rngState >>> 0;
  if (value === 0) value = 0x6d2b79f5;
  value ^= value << 13;
  value >>>= 0;
  value ^= value >>> 17;
  value >>>= 0;
  value ^= value << 5;
  value >>>= 0;
  if (value === 0) value = 0x6d2b79f5;
  state.rngState = value >>> 0;
  return state.rngState;
}

function nextFloat(state) {
  return nextUint32(state) / 0x100000000;
}

function nextInt(state, maxExclusive) {
  if (!maxExclusive || maxExclusive <= 1) return 0;
  return Math.floor(nextFloat(state) * maxExclusive);
}

module.exports = {
  hashSeed,
  nextUint32,
  nextFloat,
  nextInt,
};
