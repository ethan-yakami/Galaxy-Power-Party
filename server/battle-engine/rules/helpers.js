const { MAX_NORMAL_DICE, SOURCE_AURORA } = require('../constants');
const { INDICES_BY_MASK } = require('../actions');

function playerOffset(playerIndex) {
  return playerIndex * MAX_NORMAL_DICE;
}

function getSelectedIndices(mask) {
  return INDICES_BY_MASK[mask & 0x3f];
}

function sumMask(roll, mask) {
  let sum = 0;
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    sum += roll.values[indices[i]];
  }
  return sum;
}

function countSelectedValue(roll, mask, value) {
  let count = 0;
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    if (roll.values[indices[i]] === value) count += 1;
  }
  return count;
}

function areAllSame(roll, mask) {
  const indices = getSelectedIndices(mask);
  if (!indices.length) return false;
  const first = roll.values[indices[0]];
  for (let i = 1; i < indices.length; i += 1) {
    if (roll.values[indices[i]] !== first) return false;
  }
  return true;
}

function areAllValues(roll, mask, target) {
  const indices = getSelectedIndices(mask);
  if (!indices.length) return false;
  for (let i = 0; i < indices.length; i += 1) {
    if (roll.values[indices[i]] !== target) return false;
  }
  return true;
}

function areAllEven(roll, mask) {
  const indices = getSelectedIndices(mask);
  if (!indices.length) return false;
  for (let i = 0; i < indices.length; i += 1) {
    if (roll.values[indices[i]] % 2 !== 0) return false;
  }
  return true;
}

function hasDuplicates(roll, mask) {
  const freq = new Map();
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    const value = roll.values[indices[i]];
    const next = (freq.get(value) || 0) + 1;
    if (next >= 2) return true;
    freq.set(value, next);
  }
  return false;
}

function countPairs(roll, mask) {
  const freq = new Map();
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    const value = roll.values[indices[i]];
    freq.set(value, (freq.get(value) || 0) + 1);
  }
  let pairs = 0;
  for (const count of freq.values()) {
    pairs += Math.floor(count / 2);
  }
  return pairs;
}

function countDistinctPairedValues(roll, mask) {
  const freq = new Map();
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    const value = roll.values[indices[i]];
    freq.set(value, (freq.get(value) || 0) + 1);
  }
  let pairs = 0;
  for (const count of freq.values()) {
    if (count >= 2) pairs += 1;
  }
  return pairs;
}

function countUniqueValues(roll, mask) {
  const set = new Set();
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    set.add(roll.values[indices[i]]);
  }
  return set.size;
}

function countOddValues(roll, mask) {
  let count = 0;
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    if (roll.values[indices[i]] % 2 !== 0) count += 1;
  }
  return count;
}

function hasTriplet(roll, mask) {
  const freq = new Map();
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    const value = roll.values[indices[i]];
    const next = (freq.get(value) || 0) + 1;
    if (next >= 3) return true;
    freq.set(value, next);
  }
  return false;
}

function includesValue(roll, mask, target) {
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    if (roll.values[indices[i]] === target) return true;
  }
  return false;
}

function areAllValuesSix(roll, mask) {
  return areAllValues(roll, mask, 6);
}

function upgradeSide(side) {
  if (side <= 4) return 6;
  if (side <= 6) return 8;
  if (side <= 8) return 12;
  return 12;
}

function findMinSelectedIndex(roll, mask) {
  const indices = getSelectedIndices(mask);
  if (!indices.length) return -1;
  let best = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const index = indices[i];
    if (roll.values[index] < roll.values[best]) best = index;
  }
  return best;
}

function findHighestSelectedNonAuroraIndex(roll, mask) {
  const indices = getSelectedIndices(mask);
  let best = -1;
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i];
    if (roll.sourceKinds[index] === SOURCE_AURORA) continue;
    if (best === -1 || roll.values[index] > roll.values[best]) {
      best = index;
    }
  }
  return best;
}

function getSelectedCount(mask) {
  return getSelectedIndices(mask).length;
}

module.exports = {
  playerOffset,
  getSelectedIndices,
  sumMask,
  countSelectedValue,
  areAllSame,
  areAllValues,
  areAllEven,
  hasDuplicates,
  countPairs,
  countDistinctPairedValues,
  countUniqueValues,
  countOddValues,
  hasTriplet,
  includesValue,
  areAllValuesSix,
  upgradeSide,
  findMinSelectedIndex,
  findHighestSelectedNonAuroraIndex,
  getSelectedCount,
};
