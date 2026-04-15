function createLobbyRoutes({ handlers, broadcastCharacterCatalog }) {
  return {
    choose_character: {
      errorLabel: 'handleChooseCharacter',
      run(ws, msg) {
        handlers.handleChooseCharacter(ws, msg);
      },
    },
    choose_aurora_die: {
      errorLabel: 'handleChooseAurora',
      run(ws, msg) {
        handlers.handleChooseAurora(ws, msg);
      },
    },
    create_custom_character: {
      errorLabel: 'handleCreateCustomCharacter',
      run(ws, msg) {
        const created = handlers.handleCreateCustomCharacter(ws, msg);
        if (created) {
          broadcastCharacterCatalog();
        }
      },
    },
    list_custom_characters: {
      errorLabel: 'handleListCustomCharacters',
      run(ws) {
        handlers.handleListCustomCharacters(ws);
      },
    },
    update_custom_character: {
      errorLabel: 'handleUpdateCustomCharacter',
      run(ws, msg) {
        const updated = handlers.handleUpdateCustomCharacter(ws, msg);
        if (updated) {
          broadcastCharacterCatalog();
        }
      },
    },
    delete_custom_character: {
      errorLabel: 'handleDeleteCustomCharacter',
      run(ws, msg) {
        const deleted = handlers.handleDeleteCustomCharacter(ws, msg);
        if (deleted) {
          broadcastCharacterCatalog();
        }
      },
    },
    toggle_custom_character: {
      errorLabel: 'handleToggleCustomCharacter',
      run(ws, msg) {
        const updated = handlers.handleToggleCustomCharacter(ws, msg);
        if (updated) {
          broadcastCharacterCatalog();
        }
      },
    },
    apply_preset: {
      errorLabel: 'handleApplyPreset',
      run(ws, msg) {
        handlers.handleApplyPreset(ws, msg);
      },
    },
  };
}

module.exports = createLobbyRoutes;
