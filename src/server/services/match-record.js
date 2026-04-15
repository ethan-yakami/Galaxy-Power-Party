function buildMatchRecordFromReplay(replay) {
  if (!replay || typeof replay !== 'object') return null;
  const playersLoadout = Array.isArray(replay.playersLoadout) ? replay.playersLoadout : [];
  const result = replay.result && typeof replay.result === 'object' ? replay.result : {};
  const roomMeta = replay.roomMeta && typeof replay.roomMeta === 'object' ? replay.roomMeta : {};

  return {
    matchId: typeof replay.replayId === 'string' ? replay.replayId : '',
    sourceType: 'replay_export',
    roomCode: typeof roomMeta.roomCode === 'string' ? roomMeta.roomCode : '',
    roomMode: typeof roomMeta.roomMode === 'string' ? roomMeta.roomMode : 'standard',
    startedAt: Number.isFinite(roomMeta.startedAt) ? roomMeta.startedAt : 0,
    endedAt: Number.isFinite(result.endedAt) ? result.endedAt : null,
    resumedFromReplayId: typeof roomMeta.resumedFromReplayId === 'string' ? roomMeta.resumedFromReplayId : null,
    resumedFromStep: Number.isFinite(roomMeta.resumedFromStep) ? roomMeta.resumedFromStep : null,
    players: playersLoadout.map((player) => ({
      playerId: typeof player.playerId === 'string' ? player.playerId : '',
      name: typeof player.name === 'string' ? player.name : '',
      characterId: typeof player.characterId === 'string' ? player.characterId : '',
      auroraDiceId: typeof player.auroraDiceId === 'string' ? player.auroraDiceId : '',
    })),
    winnerPlayerId: typeof result.winnerPlayerId === 'string' ? result.winnerPlayerId : null,
    rounds: Number.isFinite(result.rounds) ? result.rounds : 0,
    endedReason: typeof result.endedReason === 'string' ? result.endedReason : '',
    actionCount: Array.isArray(replay.actions) ? replay.actions.length : 0,
  };
}

module.exports = {
  buildMatchRecordFromReplay,
};
