const { applyCheckedAction } = require('./action-applier');

function runEventPipeline(state, encodedAction, runtime) {
  // Event order and side effects are currently enforced by reducer hooks.
  return applyCheckedAction(state, encodedAction, runtime);
}

module.exports = {
  runEventPipeline,
};
