(function() {
  const { state, dom, send } = GPP;
  const fallbackModalController = {
    showWinnerOverlay() {},
    hideWinnerOverlay() {},
    showErrorToast() {},
    showDocModal() {},
    showGuideModal() {},
    getWeatherDisplay() { return null; },
    showWeatherBroadcast() {},
    showCustomCharacterModal() {},
  };

  let activeModalFactory = null;
  let activeModalController = fallbackModalController;

  function getGlossary() {
    return window.GPPGlossary || {};
  }

  function getGuideData() {
    return window.GPPGuideData || {};
  }

  function getModalFactory() {
    return window.GPPModalController || {};
  }

  function getMyName() {
    const name = dom.nameInput ? dom.nameInput.value.trim() : '';
    return name || `鐜╁${Math.floor(Math.random() * 1000)}`;
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

  function resolveModalController() {
    const modalFactory = getModalFactory();
    if (modalFactory !== activeModalFactory) {
      activeModalFactory = modalFactory;
      activeModalController = modalFactory.createModalController
        ? modalFactory.createModalController({
          state,
          send,
          glossary: getGlossary(),
          guideData: getGuideData(),
          findPlayer,
          getBaseCharacterList,
          suggestVariantId,
          parseDiceSidesInput,
        })
        : fallbackModalController;
    }
    return activeModalController || fallbackModalController;
  }

  async function ensureUiFeatures() {
    if (typeof GPP.ensureBattleFeatureSet === 'function') {
      await GPP.ensureBattleFeatureSet('ui');
    }
    return resolveModalController();
  }

  function sanitizeDisplayName(name) {
    const glossary = getGlossary();
    if (typeof glossary.sanitizeDisplayName === 'function') {
      return glossary.sanitizeDisplayName(name);
    }
    return String(name || '').trim();
  }

  function wrapGlossaryTerms(text) {
    const glossary = getGlossary();
    if (typeof glossary.wrapGlossaryTerms === 'function') {
      return glossary.wrapGlossaryTerms(text);
    }
    return String(text || '');
  }

  function charTooltipHtml(characterId, characterName) {
    const glossary = getGlossary();
    if (typeof glossary.charTooltipHtml === 'function') {
      return glossary.charTooltipHtml(state, characterId, characterName);
    }
    return String(characterName || characterId || '');
  }

  function auroraTooltipHtml(auroraDiceId, auroraDiceName) {
    const glossary = getGlossary();
    if (typeof glossary.auroraTooltipHtml === 'function') {
      return glossary.auroraTooltipHtml(state, auroraDiceId, auroraDiceName);
    }
    return String(auroraDiceName || auroraDiceId || '');
  }

  function showWinnerOverlay(text, detail, meta) {
    return resolveModalController().showWinnerOverlay(text, detail, meta);
  }

  function hideWinnerOverlay() {
    return resolveModalController().hideWinnerOverlay();
  }

  function showErrorToast(text) {
    return resolveModalController().showErrorToast(text);
  }

  async function showDocModal() {
    const modalController = await ensureUiFeatures();
    return modalController.showDocModal();
  }

  async function showGuideModal(defaultTab) {
    const modalController = await ensureUiFeatures();
    return modalController.showGuideModal(defaultTab);
  }

  function getWeatherDisplay(game) {
    return resolveModalController().getWeatherDisplay(game);
  }

  function showWeatherBroadcast(display) {
    return resolveModalController().showWeatherBroadcast(display);
  }

  async function showCustomCharacterModal() {
    const modalController = await ensureUiFeatures();
    return modalController.showCustomCharacterModal();
  }

  Object.assign(GPP, {
    getMyName,
    isMe,
    findPlayer,
    getCharacter,
    clearSelection,
    setSelection,
    sleep,
    showWinnerOverlay,
    hideWinnerOverlay,
    showErrorToast,
    showDocModal,
    showGuideModal,
    getWeatherDisplay,
    showWeatherBroadcast,
    showCustomCharacterModal,
    sanitizeDisplayName,
    wrapGlossaryTerms,
    charTooltipHtml,
    auroraTooltipHtml,
  });
})();
