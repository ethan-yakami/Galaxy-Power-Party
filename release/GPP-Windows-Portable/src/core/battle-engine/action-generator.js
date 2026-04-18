const { enumerateActions } = require('./reducer');
const { getActionOpcode, getActionMask } = require('./actions');
const { OPCODES } = require('./constants');

const KIND_BY_OPCODE = Object.freeze({
  [OPCODES.ROLL_ATTACK]: 'roll_attack',
  [OPCODES.USE_AURORA_ATTACK]: 'use_aurora_attack',
  [OPCODES.REROLL_ATTACK]: 'reroll_attack',
  [OPCODES.CONFIRM_ATTACK]: 'confirm_attack',
  [OPCODES.ROLL_DEFENSE]: 'roll_defense',
  [OPCODES.USE_AURORA_DEFENSE]: 'use_aurora_defense',
  [OPCODES.CONFIRM_DEFENSE]: 'confirm_defense',
});

function maskToIndices(mask) {
  const out = [];
  for (let bit = 0; bit < 6; bit += 1) {
    if ((mask >>> bit) & 1) out.push(bit);
  }
  return out;
}

function generateActions(state, actionBuffer) {
  const out = [];
  const count = enumerateActions(state, actionBuffer);
  for (let i = 0; i < count; i += 1) {
    const encodedAction = actionBuffer[i];
    const opcode = getActionOpcode(encodedAction);
    const mask = getActionMask(encodedAction);
    out.push({
      encodedAction,
      opcode,
      mask,
      kind: KIND_BY_OPCODE[opcode] || `opcode_${opcode}`,
      indices: maskToIndices(mask),
    });
  }
  return out;
}

module.exports = {
  KIND_BY_OPCODE,
  generateActions,
};
