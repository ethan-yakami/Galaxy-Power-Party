const { applyActionInPlace } = require('./reducer');
const { DEFAULT_RUNTIME } = require('./runtime');

function applyCheckedAction(state, encodedAction, runtime = DEFAULT_RUNTIME) {
  return applyActionInPlace(state, encodedAction, runtime);
}

module.exports = {
  applyCheckedAction,
};
