const createSharedHandlers = require('./handlers/shared');
const createRoomLifecycleHandlers = require('./handlers/room-lifecycle');
const createLobbyHandlers = require('./handlers/lobby');
const createBattleHandlers = require('./handlers/battle');

module.exports = function createHandlers(rooms, options = {}) {
  let handlers = null;
  const shared = createSharedHandlers({
    rooms,
    getHandlers: () => handlers,
  });

  const roomLifecycle = createRoomLifecycleHandlers({
    rooms,
    shared,
  });
  const lobby = createLobbyHandlers({
    rooms,
    shared,
    startGameIfReady: roomLifecycle.startGameIfReady,
  });
  const battle = createBattleHandlers({
    rooms,
    shared,
    platform: options.platform || null,
  });

  handlers = {
    ...roomLifecycle.handlers,
    ...lobby,
    ...battle,
  };

  return handlers;
};
