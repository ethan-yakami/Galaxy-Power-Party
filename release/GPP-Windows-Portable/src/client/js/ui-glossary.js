(function() {
  const GLOSSARY = Object.freeze({
    '攻击等级': '攻击时需要选择的骰子数量。',
    '防御等级': '防御时需要选择的骰子数量。',
    '曜彩骰': '特殊骰，可在选骰阶段加入当前骰池。',
    '命定': '命定骰在确认时不可被跳过。',
    '重投': '可重掷已选中骰子，会消耗重投次数。',
    '力场': '可抵消非洞穿伤害。',
    '洞穿': '无视防御值与力场直接造成伤害。',
    '中毒': '回合推进后造成持续伤害并衰减层数。',
    '荆棘': '伤害结算前先造成反噬伤害，结算后清除。',
    '力量': '攻击结算阶段提供额外攻击加成。',
    '韧性': '防御结算阶段提供额外防御加成。',
    '反击': '防御值大于攻击值时对攻击方造成反伤。',
    '超载': '攻击加成与防守自伤并存的状态。',
    '不屈': '受到致命伤害时保留 1 点生命。',
  });

  const TERMS_BY_LENGTH = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  const ESCAPED_TERMS = TERMS_BY_LENGTH.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const TERM_REGEX = new RegExp(`(${ESCAPED_TERMS.join('|')})`, 'g');

  function escapeHtml(input) {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeDisplayName(name) {
    return String(name || '').replace(/[\[\]【】]/g, '').trim();
  }

  function wrapGlossaryTerms(text) {
    const escaped = escapeHtml(String(text || ''));
    return escaped.replace(TERM_REGEX, (match) => {
      const desc = escapeHtml(GLOSSARY[match] || '');
      return `<span class="glossTip">${match}<span class="glossTipText">${desc}</span></span>`;
    });
  }

  function charTooltipHtml(state, characterId, characterName) {
    const safeName = sanitizeDisplayName(characterName || '');
    const character = state && state.characters ? state.characters[characterId] : null;
    if (!character) return escapeHtml(safeName);
    return [
      `<span class="glossTip">${escapeHtml(sanitizeDisplayName(character.name || safeName))}`,
      '<span class="glossTipText">',
      escapeHtml(`HP ${character.hp} | ${character.shortSpec || ''}`),
      `<br>${escapeHtml(`技能：${character.skillText || ''}`)}`,
      '</span></span>',
    ].join('');
  }

  function auroraTooltipHtml(state, auroraDiceId, auroraDiceName) {
    const fallbackName = sanitizeDisplayName(auroraDiceName || '无');
    if (!auroraDiceId) return escapeHtml(fallbackName);
    const list = (state && Array.isArray(state.auroraDice)) ? state.auroraDice : [];
    const aurora = list.find((item) => item && item.id === auroraDiceId);
    if (!aurora) return escapeHtml(fallbackName);
    return [
      `<span class="glossTip">${escapeHtml(sanitizeDisplayName(aurora.name || fallbackName))}`,
      '<span class="glossTipText">',
      escapeHtml(`骰面：${aurora.facesText || ''}`),
      `<br>${escapeHtml(aurora.effectText || '')}`,
      `<br>${escapeHtml(`条件：${aurora.conditionText || ''}`)}`,
      '</span></span>',
    ].join('');
  }

  window.GPPGlossary = {
    GLOSSARY,
    escapeHtml,
    sanitizeDisplayName,
    wrapGlossaryTerms,
    charTooltipHtml,
    auroraTooltipHtml,
  };
})();

