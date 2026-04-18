const { compileCatalog, invalidateCompiledCatalog } = require('./catalog/compiler');
const { createBattle, cloneState, serializeState, deserializeState } = require('./state');
const { enumerateActions, applyActionInPlace, isTerminal, canUseAurora } = require('./reducer');
const { projectStateToLegacyRoom } = require('./projector');
const { rolloutMany } = require('./simulation');
const { createRuntime } = require('./runtime');
const { encodeAction, getActionMask, getActionOpcode, indicesToMask } = require('./actions');
const { generateActions } = require('./action-generator');
const { applyCheckedAction } = require('./action-applier');
const { runEventPipeline } = require('./event-pipeline');
const { OPCODES, PHASE_NAMES } = require('./constants');

module.exports = {
  compileCatalog,
  invalidateCompiledCatalog,
  createBattle,
  cloneState,
  enumerateActions,
  applyActionInPlace,
  isTerminal,
  projectStateToLegacyRoom,
  serializeState,
  deserializeState,
  rolloutMany,
  createRuntime,
  encodeAction,
  getActionMask,
  getActionOpcode,
  indicesToMask,
  generateActions,
  applyCheckedAction,
  runEventPipeline,
  OPCODES,
  PHASE_NAMES,
  canUseAurora,
};
