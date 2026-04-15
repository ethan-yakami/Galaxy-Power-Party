const assert = require('assert');

const battleViewModel = require('../../src/client/js/battle-view-model');

function main() {
  const players = [
    { id: 'P1', name: '玩家59' },
    { id: 'AI', name: 'AI 对手' },
  ];

  const enemyTurn = battleViewModel.deriveBattleView({
    status: 'in_game',
    phase: 'attack_reroll_or_select',
    pendingActorId: 'AI',
    pendingActionKind: 'attack_select',
    pendingActionLabel: '选择攻击骰',
    isAiThinking: true,
  }, 'P1', players);
  assert.strictEqual(enemyTurn.kind, 'enemy');
  assert.strictEqual(enemyTurn.actionKind, 'attack_select');
  assert.strictEqual(enemyTurn.isEnemyTurn, true);
  assert.strictEqual(enemyTurn.isAiThinking, true);
  assert(enemyTurn.turnText.includes('AI'));
  assert(enemyTurn.railHint.includes('AI'));

  const selfTurn = battleViewModel.deriveBattleView({
    status: 'in_game',
    phase: 'defense_roll',
    pendingActorId: 'P1',
    pendingActionKind: 'defense_roll',
    pendingActionLabel: '掷防御骰',
    isAiThinking: false,
  }, 'P1', players);
  assert.strictEqual(selfTurn.kind, 'self');
  assert.strictEqual(selfTurn.actionKind, 'defense_roll');
  assert.strictEqual(selfTurn.isMyTurn, true);
  assert(selfTurn.turnText.includes('你'));

  const ended = battleViewModel.deriveBattleView({
    status: 'ended',
    phase: 'ended',
    winnerId: 'P1',
  }, 'P1', players);
  assert.strictEqual(ended.kind, 'ended');
  assert(ended.turnText.includes('胜者'));

  console.log('battle-view-model tests passed');
}

main();
