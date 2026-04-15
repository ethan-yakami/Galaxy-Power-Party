const { send } = require('../services/rooms');
const { ERROR_CODES, sendError } = require('./protocol/errors');
const createRoomLifecycleRoutes = require('./message-routes/room-lifecycle');
const createLobbyRoutes = require('./message-routes/lobby');
const createCombatRoutes = require('./message-routes/combat');

function createMessageRouter({ handlers, broadcastCharacterCatalog }) {
  const routes = Object.assign(
    {},
    createRoomLifecycleRoutes({ handlers, ERROR_CODES, send }),
    createLobbyRoutes({ handlers, broadcastCharacterCatalog }),
    createCombatRoutes({ handlers }),
  );

  function dispatch(ws, envelope, legacyMessage) {
    const route = routes[envelope.type];
    if (!route) {
      sendError(ws, ERROR_CODES.UNKNOWN_TYPE, 'Unknown message type.', {
        meta: envelope.meta,
      });
      return false;
    }

    try {
      route.run(ws, legacyMessage, envelope);
    } catch (err) {
      const label = route.errorLabel || envelope.type;
      console.error(`[Error] ${label}:`, err);
      if (typeof route.onError === 'function') {
        route.onError(ws, envelope, err);
      } else if (!route.swallowErrors) {
        sendError(ws, ERROR_CODES.INTERNAL_ERROR, 'Internal server error.', {
          meta: envelope.meta,
        });
      }
    }
    return true;
  }

  return {
    dispatch,
    routeTypes: Object.freeze(Object.keys(routes)),
  };
}

module.exports = createMessageRouter;

