(function() {
  const { state, dom, send } = GPP;
  const glossary = window.GPPGlossary || {};
  const guideData = window.GPPGuideData || {};
  const modalFactory = window.GPPModalController || {};

  function getMyName() {
    const name = dom.nameInput ? dom.nameInput.value.trim() : '';
    return name || `玩家${Math.floor(Math.random() * 1000)}`;
  }

  function isMe(playerId) {
    return state.me === playerId;
  }

  function findPlayer(id) {
    if (!state.room || !state.room.players) return null;
    return state.room.players.find((p) => p.id === id) || null;
  }

  function getCharacter(characterId) {
    return state.characters[characterId] || null;
  }

  function clearSelection() {
    state.selectedDice.clear();
  }

  function setSelection(indices) {
    state.selectedDice = new Set(indices || []);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getBaseCharacterList() {
    return Object.keys(state.characters)
      .map((id) => state.characters[id])
      .filter((character) => !character.isCustomVariant)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));
  }

  function suggestVariantId(baseCharacterId) {
    const prefix = `${baseCharacterId}_v`;
    let maxN = 1;
    Object.keys(state.characters).forEach((id) => {
      if (!id.startsWith(prefix)) return;
      const suffix = id.slice(prefix.length);
      const n = Number(suffix);
      if (Number.isInteger(n) && n >= maxN) {
        maxN = n + 1;
      }
    });
    return `${prefix}${maxN}`;
  }

  function parseDiceSidesInput(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return null;
    const values = [];
    for (const part of parts) {
      if (!/^-?\d+$/.test(part)) return null;
      const value = Number(part);
      if (!Number.isInteger(value) || value < 2) return null;
      values.push(value);
    }
    return values;
  }

  const modalController = modalFactory.createModalController
    ? modalFactory.createModalController({
      state,
      send,
      glossary,
      guideData,
      findPlayer,
      getBaseCharacterList,
      suggestVariantId,
      parseDiceSidesInput,
    })
    : {
      showWinnerOverlay() {},
      hideWinnerOverlay() {},
      showErrorToast() {},
      showDocModal() {},
      showGuideModal() {},
      getWeatherDisplay() { return null; },
      showWeatherBroadcast() {},
      showCustomCharacterModal() {},
    };

  const sanitizeDisplayName = glossary.sanitizeDisplayName || ((name) => String(name || '').trim());
  const wrapGlossaryTerms = glossary.wrapGlossaryTerms || ((text) => String(text || ''));
  const charTooltipHtml = glossary.charTooltipHtml
    ? (characterId, characterName) => glossary.charTooltipHtml(state, characterId, characterName)
    : ((characterId, characterName) => String(characterName || characterId || ''));
  const auroraTooltipHtml = glossary.auroraTooltipHtml
    ? (auroraDiceId, auroraDiceName) => glossary.auroraTooltipHtml(state, auroraDiceId, auroraDiceName)
    : ((auroraDiceId, auroraDiceName) => String(auroraDiceName || auroraDiceId || ''));

  Object.assign(GPP, {
    getMyName,
    isMe,
    findPlayer,
    getCharacter,
    clearSelection,
    setSelection,
    sleep,
    showWinnerOverlay: modalController.showWinnerOverlay,
    hideWinnerOverlay: modalController.hideWinnerOverlay,
    showErrorToast: modalController.showErrorToast,
    showDocModal: modalController.showDocModal,
    showGuideModal: modalController.showGuideModal,
    getWeatherDisplay: modalController.getWeatherDisplay,
    showWeatherBroadcast: modalController.showWeatherBroadcast,
    showCustomCharacterModal: modalController.showCustomCharacterModal,
    sanitizeDisplayName,
    wrapGlossaryTerms,
    charTooltipHtml,
    auroraTooltipHtml,
  });
})();

