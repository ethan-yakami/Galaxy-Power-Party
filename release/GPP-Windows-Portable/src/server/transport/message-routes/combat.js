function createCombatRoutes({ handlers }) {
  function deprecated(ws) {
    handlers.handleDeprecatedBattleProtocol(ws);
  }

  return {
    roll_attack: {
      errorLabel: 'handleDeprecatedBattleProtocol',
      run(ws) {
        deprecated(ws);
      },
    },
    use_aurora_die: {
      errorLabel: 'handleDeprecatedBattleProtocol',
      run(ws) {
        deprecated(ws);
      },
    },
    reroll_attack: {
      errorLabel: 'handleDeprecatedBattleProtocol',
      run(ws) {
        deprecated(ws);
      },
    },
    update_live_selection: {
      errorLabel: 'handleUpdateLiveSelection',
      run(ws, msg) {
        handlers.handleUpdateLiveSelection(ws, msg);
      },
      swallowErrors: true,
    },
    confirm_attack_selection: {
      errorLabel: 'handleDeprecatedBattleProtocol',
      run(ws) {
        deprecated(ws);
      },
    },
    roll_defense: {
      errorLabel: 'handleDeprecatedBattleProtocol',
      run(ws) {
        deprecated(ws);
      },
    },
    confirm_defense_selection: {
      errorLabel: 'handleDeprecatedBattleProtocol',
      run(ws) {
        deprecated(ws);
      },
    },
    submit_battle_action: {
      errorLabel: 'handleSubmitBattleAction',
      run(ws, msg) {
        handlers.handleSubmitBattleAction(ws, msg);
      },
    },
    export_replay: {
      errorLabel: 'handleExportReplay',
      run(ws, msg, envelope) {
        handlers.handleExportReplay(ws, msg, envelope);
      },
    },
  };
}

module.exports = createCombatRoutes;
