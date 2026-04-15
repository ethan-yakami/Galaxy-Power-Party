function createCombatRoutes({ handlers }) {
  return {
    roll_attack: {
      errorLabel: 'handleRollAttack',
      run(ws) {
        handlers.handleRollAttack(ws);
      },
    },
    use_aurora_die: {
      errorLabel: 'handleUseAurora',
      run(ws) {
        handlers.handleUseAurora(ws);
      },
    },
    reroll_attack: {
      errorLabel: 'handleRerollAttack',
      run(ws, msg) {
        handlers.handleRerollAttack(ws, msg);
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
      errorLabel: 'handleConfirmAttack',
      run(ws, msg) {
        handlers.handleConfirmAttack(ws, msg);
      },
    },
    roll_defense: {
      errorLabel: 'handleRollDefense',
      run(ws) {
        handlers.handleRollDefense(ws);
      },
    },
    confirm_defense_selection: {
      errorLabel: 'handleConfirmDefense',
      run(ws, msg) {
        handlers.handleConfirmDefense(ws, msg);
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
