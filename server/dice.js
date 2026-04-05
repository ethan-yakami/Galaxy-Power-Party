const { AuroraRegistry } = require('./registry');

function newNormalDie(value, sides, slotId) {
  return {
    value,
    label: `${value}`,
    hasA: false,
    isAurora: false,
    sides,
    maxValue: sides,
    slotId,
    auroraId: null,
    auroraName: null,
    effectText: null,
    conditionText: null,
  };
}

function makeNormalDiceFromPool(diceSides) {
  return diceSides.map((sides, slotId) => {
    const value = Math.floor(Math.random() * sides) + 1;
    return newNormalDie(value, sides, slotId);
  });
}

function rollAuroraFace(auroraId) {
  const aurora = AuroraRegistry[auroraId];
  const face = aurora.faces[Math.floor(Math.random() * aurora.faces.length)];
  const maxValue = aurora.faces.reduce((acc, f) => (f.value > acc ? f.value : acc), 0);
  return {
    value: face.value,
    label: face.hasA ? `${face.value}A` : `${face.value}`,
    hasA: face.hasA,
    isAurora: true,
    sides: null,
    maxValue,
    slotId: null,
    auroraId,
    auroraName: aurora.name,
    effectText: aurora.effectText,
    conditionText: aurora.conditionText,
  };
}

function rerollOneDie(oldDie, player) {
  if (oldDie.isAurora) return rollAuroraFace(player.auroraDiceId);
  const sides = oldDie.sides;
  const value = Math.floor(Math.random() * sides) + 1;
  return newNormalDie(value, sides, oldDie.slotId);
}

function sortDice(dice) {
  dice.sort((a, b) => {
    if (a.value !== b.value) return a.value - b.value;
    if (a.isAurora !== b.isAurora) return a.isAurora ? 1 : -1;
    if (a.sides !== b.sides) return (a.sides || 0) - (b.sides || 0);
    return 0;
  });
}

function diceToText(dice) {
  return dice.map((d) => d.label).join(', ');
}

function sumByIndices(dice, indices) {
  return indices.reduce((acc, idx) => acc + dice[idx].value, 0);
}

function isValidDistinctIndices(indices, needCount, diceCount) {
  if (!Array.isArray(indices)) return false;
  if (indices.length !== needCount) return false;
  const set = new Set(indices);
  if (set.size !== needCount) return false;
  for (const idx of indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= diceCount) return false;
  }
  return true;
}

function isValidDistinctIndicesAnyCount(indices, diceCount) {
  if (!Array.isArray(indices)) return false;
  const set = new Set(indices);
  if (set.size !== indices.length) return false;
  for (const idx of indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= diceCount) return false;
  }
  return true;
}

function countSelectedValue(selectedDice, val) {
  return selectedDice.filter((d) => d.value === val).length;
}

function areAllValues(selectedDice, target) {
  return selectedDice.length > 0 && selectedDice.every((d) => d.value === target);
}

function areAllEven(selectedDice) {
  return selectedDice.length > 0 && selectedDice.every((d) => d.value % 2 === 0);
}

function areAllSame(selectedDice) {
  return selectedDice.length > 0 && selectedDice.every((d) => d.value === selectedDice[0].value);
}

function hasDuplicates(selectedDice) {
  const seen = new Set();
  for (const d of selectedDice) {
    if (seen.has(d.value)) return true;
    seen.add(d.value);
  }
  return false;
}

function countDistinctPairedValues(selectedDice) {
  const freq = {};
  for (const d of selectedDice) freq[d.value] = (freq[d.value] || 0) + 1;
  let count = 0;
  for (const v of Object.values(freq)) {
    if (v >= 2) count++;
  }
  return count;
}

function countPairs(selectedDice) {
  const freq = {};
  for (const d of selectedDice) freq[d.value] = (freq[d.value] || 0) + 1;
  let pairs = 0;
  for (const v of Object.values(freq)) pairs += Math.floor(v / 2);
  return pairs;
}

function countUniqueValues(selectedDice) {
  return new Set(selectedDice.map((d) => d.value)).size;
}

function countOddValues(selectedDice) {
  return selectedDice.filter((d) => d.value % 2 !== 0).length;
}

function areAllValuesSix(selectedDice) {
  return selectedDice.length > 0 && selectedDice.every((d) => d.value === 6);
}

function upgradeSide(side) {
  if (side <= 4) return 6;
  if (side <= 6) return 8;
  if (side <= 8) return 12;
  return 12;
}

module.exports = {
  newNormalDie,
  makeNormalDiceFromPool,
  rollAuroraFace,
  rerollOneDie,
  sortDice,
  diceToText,
  sumByIndices,
  isValidDistinctIndices,
  isValidDistinctIndicesAnyCount,
  countSelectedValue,
  areAllValues,
  areAllEven,
  areAllSame,
  hasDuplicates,
  countDistinctPairedValues,
  countPairs,
  countUniqueValues,
  countOddValues,
  areAllValuesSix,
  upgradeSide,
};

