const { MAX_ROLL_DICE } = require('./constants');

const POPCOUNT = new Uint8Array(1 << MAX_ROLL_DICE);
const INDICES_BY_MASK = Array.from({ length: 1 << MAX_ROLL_DICE }, () => []);
const MASKS_BY_COUNT = Array.from({ length: MAX_ROLL_DICE + 1 }, () => []);
const MASKS_BY_ROLL_AND_COUNT = Array.from({ length: MAX_ROLL_DICE + 1 }, () => (
  Array.from({ length: MAX_ROLL_DICE + 1 }, () => [])
));

for (let mask = 0; mask < (1 << MAX_ROLL_DICE); mask += 1) {
  let count = 0;
  const indices = [];
  for (let bit = 0; bit < MAX_ROLL_DICE; bit += 1) {
    if ((mask >>> bit) & 1) {
      count += 1;
      indices.push(bit);
    }
  }
  POPCOUNT[mask] = count;
  INDICES_BY_MASK[mask] = indices;
  MASKS_BY_COUNT[count].push(mask);
}

for (let rollCount = 0; rollCount <= MAX_ROLL_DICE; rollCount += 1) {
  const rollMaskLimit = 1 << rollCount;
  for (let needCount = 0; needCount <= MAX_ROLL_DICE; needCount += 1) {
    const out = [];
    for (let mask = 0; mask < rollMaskLimit; mask += 1) {
      if (POPCOUNT[mask] === needCount) out.push(mask);
    }
    MASKS_BY_ROLL_AND_COUNT[rollCount][needCount] = out;
  }
}

function encodeAction(opcode, mask) {
  return ((opcode & 0x0f) << 6) | (mask & 0x3f);
}

function getActionOpcode(action) {
  return (action >>> 6) & 0x0f;
}

function getActionMask(action) {
  return action & 0x3f;
}

function indicesToMask(indices, maxCount) {
  if (!Array.isArray(indices)) return 0;
  let mask = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const idx = indices[i];
    if (!Number.isInteger(idx) || idx < 0 || idx >= maxCount || idx >= MAX_ROLL_DICE) {
      return -1;
    }
    const bit = 1 << idx;
    if (mask & bit) return -1;
    mask |= bit;
  }
  return mask;
}

function fullMask(count) {
  if (count <= 0) return 0;
  if (count >= MAX_ROLL_DICE) return 0x3f;
  return (1 << count) - 1;
}

module.exports = {
  POPCOUNT,
  INDICES_BY_MASK,
  MASKS_BY_COUNT,
  MASKS_BY_ROLL_AND_COUNT,
  encodeAction,
  getActionOpcode,
  getActionMask,
  indicesToMask,
  fullMask,
};
