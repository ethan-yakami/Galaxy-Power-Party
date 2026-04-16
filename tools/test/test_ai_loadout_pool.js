const assert = require('assert');

const { RESTRICTED_AI_LOADOUTS } = require('../../src/server/ai/config');
const { createAIPlayer, reRandomizeAIPlayer } = require('../../src/server/ai');

function normalizeLoadout(characterId, auroraDiceId) {
  return `${characterId}::${auroraDiceId || ''}`;
}

function main() {
  const allowed = new Set(RESTRICTED_AI_LOADOUTS.map((item) => normalizeLoadout(item.characterId, item.auroraDiceId)));
  const seen = new Set();

  for (let i = 0; i < 200; i += 1) {
    const player = createAIPlayer(`room_${i}`);
    const key = normalizeLoadout(player.characterId, player.auroraDiceId);
    assert.ok(allowed.has(key), `unexpected AI loadout: ${key}`);
    seen.add(key);
  }

  const player = createAIPlayer('reroll_room');
  for (let i = 0; i < 200; i += 1) {
    reRandomizeAIPlayer(player);
    const key = normalizeLoadout(player.characterId, player.auroraDiceId);
    assert.ok(allowed.has(key), `unexpected rerolled AI loadout: ${key}`);
    seen.add(key);
  }

  assert.ok(seen.has('zhigengniao::'), 'zhigengniao should appear without aurora');
  assert.ok(seen.size >= 8, 'AI pool should expose multiple allowed loadouts');
  console.log('ai loadout pool test passed');
}

main();
