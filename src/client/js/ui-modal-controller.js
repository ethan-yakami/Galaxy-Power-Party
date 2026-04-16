(function() {
  function createModalController(deps) {
    const {
      state,
      send,
      glossary,
      guideData,
      findPlayer,
      getBaseCharacterList,
      suggestVariantId,
      parseDiceSidesInput,
    } = deps;

    const escapeHtml = glossary.escapeHtml;
    const wrapGlossaryTerms = glossary.wrapGlossaryTerms;

    let weatherBroadcastTimer = null;
    let weatherBroadcastHideTimer = null;

    function getWinnerOverlay() {
      let node = document.getElementById('winnerOverlay');
      if (node) return node;
      node = document.createElement('div');
      node.id = 'winnerOverlay';
      node.className = 'winnerOverlay hidden';

      const card = document.createElement('div');
      card.className = 'winnerOverlayCard';

      const text = document.createElement('div');
      text.id = 'winnerOverlayText';
      text.className = 'winnerOverlayText';
      card.appendChild(text);

      const detail = document.createElement('div');
      detail.id = 'winnerOverlayDetail';
      detail.className = 'winnerOverlayDetail hidden';
      card.appendChild(detail);

      const meta = document.createElement('div');
      meta.id = 'winnerOverlayMeta';
      meta.className = 'winnerOverlayMeta hidden';
      card.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'winnerOverlayActions';

      const playAgainBtn = document.createElement('button');
      playAgainBtn.id = 'winnerPlayAgainBtn';
      playAgainBtn.textContent = '再来一局';
      playAgainBtn.onclick = () => {
        hideWinnerOverlay();
        send('play_again');
      };

      const disbandBtn = document.createElement('button');
      disbandBtn.id = 'winnerDisbandBtn';
      disbandBtn.className = 'danger';
      disbandBtn.textContent = '解散房间';
      disbandBtn.onclick = () => {
        hideWinnerOverlay();
        send('disband_room');
      };

      actions.appendChild(playAgainBtn);
      actions.appendChild(disbandBtn);
      card.appendChild(actions);
      node.appendChild(card);
      document.body.appendChild(node);
      return node;
    }

    function showWinnerOverlay(text, detail, meta) {
      const node = getWinnerOverlay();
      const textNode = document.getElementById('winnerOverlayText');
      const detailNode = document.getElementById('winnerOverlayDetail');
      const metaNode = document.getElementById('winnerOverlayMeta');
      if (textNode) textNode.textContent = text || '';
      if (detailNode) {
        detailNode.textContent = detail || '';
        detailNode.classList.toggle('hidden', !detail);
      }
      if (metaNode) {
        metaNode.textContent = meta || '';
        metaNode.classList.toggle('hidden', !meta);
      }
      node.classList.remove('hidden');
    }

    function hideWinnerOverlay() {
      const node = document.getElementById('winnerOverlay');
      if (node) node.classList.add('hidden');
    }

    function getErrorToastContainer() {
      let box = document.getElementById('errorToastContainer');
      if (!box) {
        box = document.createElement('div');
        box.id = 'errorToastContainer';
        box.className = 'errorToastContainer';
        document.body.appendChild(box);
      }
      return box;
    }

    function showErrorToast(text) {
      const container = getErrorToastContainer();
      const toast = document.createElement('div');
      toast.className = 'errorToast';
      const content = text || '发生错误';
      const isImportant = /命定|重投|必须|网络|断线|恢复/.test(content);
      if (isImportant) toast.classList.add('important');

      const msg = document.createElement('div');
      msg.className = 'errorToastMsg';
      msg.textContent = content;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'errorToastClose';
      closeBtn.type = 'button';
      closeBtn.textContent = 'x';

      let removed = false;
      const removeToast = () => {
        if (removed) return;
        removed = true;
        toast.classList.add('hide');
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 180);
      };

      closeBtn.onclick = removeToast;
      toast.appendChild(msg);
      toast.appendChild(closeBtn);
      container.appendChild(toast);

      requestAnimationFrame(() => toast.classList.add('show'));
      setTimeout(removeToast, isImportant ? 4600 : 3200);
    }

    function buildDocContent() {
      const chars = Object.keys(state.characters).map((id) => state.characters[id]);
      const charSection = chars.length
        ? chars.map((c) => `<b>${c.name}</b> - HP ${c.hp} | ${c.shortSpec}\n技能：${c.skillText}`).join('\n\n')
        : '（加载中...）';

      const auroraSection = state.auroraDice.length
        ? state.auroraDice.map((a) => `<b>${a.name}</b> - 骰面：${a.facesText}\n${a.effectText}\n条件：${a.conditionText}`).join('\n\n')
        : '（加载中...）';

      return `<h2>游戏文档</h2>
<h3>基础规则</h3>
<p>银河战力党是 2 人回合制骰子对战游戏。双方各选 1 名角色和 1 颗曜彩骰，轮流进行攻防。</p>
<ol>
  <li>攻击掷骰</li>
  <li>攻击重投/选骰</li>
  <li>防御掷骰</li>
  <li>防御选骰</li>
  <li>伤害结算并交换攻防</li>
</ol>
<h3>角色一览</h3>
<pre>${charSection}</pre>
<h3>曜彩骰一览</h3>
<pre>${auroraSection}</pre>`;
    }

    function showDocModal() {
      let overlay = document.getElementById('docOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'docOverlay';
        overlay.className = 'docOverlay';

        const card = document.createElement('div');
        card.className = 'docCard';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'docCloseBtn';
        closeBtn.textContent = '关闭';
        closeBtn.onclick = () => overlay.classList.add('hidden');

        const content = document.createElement('div');
        content.id = 'docContent';
        content.className = 'docContent';

        card.appendChild(closeBtn);
        card.appendChild(content);
        overlay.appendChild(card);
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
        document.body.appendChild(overlay);
      }

      document.getElementById('docContent').innerHTML = buildDocContent();
      overlay.classList.remove('hidden');
    }

    function buildWeatherGuideSection(activeStage) {
      const guide = guideData.buildWeatherGuideData(state.weatherCatalog || {});
      const stage = guideData.normalizeGuideStage(activeStage);
      const cards = guide.stages[stage] || [];
      const stageTabsHtml = guideData.WEATHER_STAGE_ORDER.map((round) => {
        const count = (guide.stages[round] || []).length;
        const activeClass = round === stage ? ' active' : '';
        return `<button type="button" class="guideStageTab${activeClass}" data-guide-stage="${round}">回合${round}（${count}）</button>`;
      }).join('');

      const cardsHtml = cards.map((card) => {
        const typeClass = guideData.WEATHER_TYPE_CLASS[card.type] || 'assist';
        return [
          '<article class="weatherGuideCard">',
          `  <header class="weatherGuideCardHead"><h4>${escapeHtml(card.name)}</h4><span class="weatherTypeTag weatherType-${typeClass}">${escapeHtml(card.type)}</span></header>`,
          '  <dl class="weatherGuideMeta">',
          `    <div><dt>触发时机</dt><dd>${wrapGlossaryTerms(card.timing)}</dd></div>`,
          `    <div><dt>条件</dt><dd>${wrapGlossaryTerms(card.condition)}</dd></div>`,
          `    <div><dt>效果</dt><dd>${wrapGlossaryTerms(card.effect)}</dd></div>`,
          '  </dl>',
          '</article>',
        ].join('');
      }).join('');

      return [
        '<section class="guideSection">',
        '  <div class="guideRuleBox">',
        '    <h3>天气规则总览</h3>',
        `    <ul>${guide.introRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>`,
        '  </div>',
        `  <div class="guideStageTabs">${stageTabsHtml}</div>`,
        `  <p class="guideStageHint">当前展示：回合${stage}天气候选池，共 ${cards.length} 张。</p>`,
        `  <div class="weatherGuideGrid">${cardsHtml}</div>`,
        '</section>',
      ].join('');
    }

    function buildMechanicGuideSection() {
      const rows = guideData.MECHANIC_GUIDE.map((entry) => [
        '<article class="mechanicGuideCard">',
        `  <h4>${escapeHtml(entry.term)}</h4>`,
        `  <p class="mechanicGuideTiming"><b>触发时机：</b>${escapeHtml(entry.timing)}</p>`,
        `  <p>${wrapGlossaryTerms(entry.description)}</p>`,
        '</article>',
      ].join('')).join('');

      return [
        '<section class="guideSection">',
        '  <div class="guideRuleBox">',
        '    <h3>机制词典</h3>',
        '    <p>用于快速理解状态、结算与触发链路。</p>',
        '  </div>',
        `  <div class="mechanicGuideGrid">${rows}</div>`,
        '</section>',
      ].join('');
    }

    function buildGuideModalContent(activeTab, activeStage) {
      const tab = guideData.normalizeGuideTab(activeTab);
      const topTabsHtml = [
        `<button type="button" class="guideTopTab${tab === 'weather' ? ' active' : ''}" data-guide-tab="weather">天气介绍</button>`,
        `<button type="button" class="guideTopTab${tab === 'mechanic' ? ' active' : ''}" data-guide-tab="mechanic">机制介绍</button>`,
      ].join('');

      return [
        `<div class="guideTopTabs">${topTabsHtml}</div>`,
        tab === 'weather' ? buildWeatherGuideSection(activeStage) : buildMechanicGuideSection(),
      ].join('');
    }

    function closeGuideModal() {
      const overlay = document.getElementById('guideOverlay');
      if (overlay) overlay.classList.add('hidden');
    }

    function renderGuideModal(overlay) {
      if (!overlay) return;
      const activeTab = guideData.normalizeGuideTab(overlay.dataset.activeTab);
      const activeStage = guideData.normalizeGuideStage(overlay.dataset.activeStage);
      overlay.dataset.activeTab = activeTab;
      overlay.dataset.activeStage = String(activeStage);
      const content = overlay.querySelector('#guideContent');
      if (content) content.innerHTML = buildGuideModalContent(activeTab, activeStage);
    }

    function getGuideOverlay() {
      let overlay = document.getElementById('guideOverlay');
      if (overlay) return overlay;

      overlay = document.createElement('div');
      overlay.id = 'guideOverlay';
      overlay.className = 'docOverlay hidden';
      overlay.dataset.activeTab = 'weather';
      overlay.dataset.activeStage = String(guideData.WEATHER_STAGE_ORDER[0]);

      const card = document.createElement('div');
      card.className = 'docCard guideCard';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'docCloseBtn';
      closeBtn.type = 'button';
      closeBtn.textContent = '关闭';
      closeBtn.onclick = closeGuideModal;

      const title = document.createElement('h2');
      title.className = 'guideTitle';
      title.textContent = '天气与机制';

      const content = document.createElement('div');
      content.id = 'guideContent';
      content.className = 'guideContent';

      card.appendChild(closeBtn);
      card.appendChild(title);
      card.appendChild(content);
      overlay.appendChild(card);

      overlay.onclick = (event) => {
        if (event.target === overlay) closeGuideModal();
      };

      card.onclick = (event) => {
        const tabBtn = event.target.closest('[data-guide-tab]');
        if (tabBtn) {
          overlay.dataset.activeTab = tabBtn.getAttribute('data-guide-tab') || 'weather';
          renderGuideModal(overlay);
          return;
        }
        const stageBtn = event.target.closest('[data-guide-stage]');
        if (stageBtn) {
          overlay.dataset.activeStage = stageBtn.getAttribute('data-guide-stage') || String(guideData.WEATHER_STAGE_ORDER[0]);
          renderGuideModal(overlay);
        }
      };

      document.body.appendChild(overlay);
      return overlay;
    }

    function showGuideModal(defaultTab) {
      const overlay = getGuideOverlay();
      overlay.dataset.activeTab = guideData.normalizeGuideTab(defaultTab || overlay.dataset.activeTab);
      overlay.dataset.activeStage = String(guideData.normalizeGuideStage(overlay.dataset.activeStage));
      renderGuideModal(overlay);
      overlay.classList.remove('hidden');
    }

    function getWeatherDisplay(game) {
      return guideData.getWeatherDisplay(game || {});
    }

    function getWeatherBroadcastNode() {
      let node = document.getElementById('weatherBroadcast');
      if (!node) {
        node = document.createElement('div');
        node.id = 'weatherBroadcast';
        node.className = 'weatherBroadcast hidden';
        document.body.appendChild(node);
      }
      return node;
    }

    function hideWeatherBroadcast(node) {
      if (!node) return;
      node.classList.remove('show');
      if (weatherBroadcastHideTimer) clearTimeout(weatherBroadcastHideTimer);
      weatherBroadcastHideTimer = setTimeout(() => {
        node.classList.add('hidden');
        weatherBroadcastHideTimer = null;
      }, 180);
    }

    function showWeatherBroadcast(display) {
      if (!display) return;
      const node = getWeatherBroadcastNode();
      const text = display.isNone
        ? '天气切换：无天气'
        : `天气切换：${display.name} - ${display.effect}`;

      if (weatherBroadcastTimer) clearTimeout(weatherBroadcastTimer);
      if (weatherBroadcastHideTimer) {
        clearTimeout(weatherBroadcastHideTimer);
        weatherBroadcastHideTimer = null;
      }

      node.textContent = text;
      node.classList.remove('hidden');
      requestAnimationFrame(() => node.classList.add('show'));

      weatherBroadcastTimer = setTimeout(() => {
        hideWeatherBroadcast(node);
        weatherBroadcastTimer = null;
      }, 4500);
    }

    function getCustomCharacterOverlay() {
      let overlay = document.getElementById('customCharacterOverlay');
      if (overlay) return overlay;

      overlay = document.createElement('div');
      overlay.id = 'customCharacterOverlay';
      overlay.className = 'docOverlay hidden';

      const card = document.createElement('div');
      card.className = 'docCard customCharacterCard';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'docCloseBtn';
      closeBtn.type = 'button';
      closeBtn.textContent = '关闭';
      closeBtn.onclick = () => overlay.classList.add('hidden');

      const title = document.createElement('h2');
      title.textContent = '新建自定义角色';

      const intro = document.createElement('p');
      intro.className = 'docNote';
      intro.textContent = '继承母角色机制，仅调整数值（HP、骰面、攻防等级、曜彩次数、重投上限）。';

      const form = document.createElement('form');
      form.id = 'customCharacterForm';
      form.className = 'customCharacterForm';
      form.innerHTML = [
        '<label>母角色',
        '  <select id="ccBaseCharacterId"></select>',
        '</label>',
        '<label>新角色 ID（小写字母/数字/下划线）',
        '  <input id="ccVariantId" type="text" maxlength="40" placeholder="yaoguang_v2" />',
        '</label>',
        '<label>显示名称',
        '  <input id="ccVariantName" type="text" maxlength="40" placeholder="曜光 v2" />',
        '</label>',
        '<label>HP',
        '  <input id="ccHp" type="number" min="1" step="1" />',
        '</label>',
        '<label>普通骰面（逗号分隔）',
        '  <input id="ccDiceSides" type="text" placeholder="8,8,6,6,4" />',
        '</label>',
        '<label>曜彩使用次数',
        '  <input id="ccAuroraUses" type="number" min="0" step="1" />',
        '</label>',
        '<label>攻击等级',
        '  <input id="ccAttackLevel" type="number" min="1" step="1" />',
        '</label>',
        '<label>防御等级',
        '  <input id="ccDefenseLevel" type="number" min="1" step="1" />',
        '</label>',
        '<label>攻击阶段可重投次数',
        '  <input id="ccMaxAttackRerolls" type="number" min="0" step="1" />',
        '</label>',
        '<div class="actions">',
        '  <button id="ccSubmitBtn" class="primaryBtn" type="submit">保存自定义角色</button>',
        '</div>',
      ].join('');

      card.appendChild(closeBtn);
      card.appendChild(title);
      card.appendChild(intro);
      card.appendChild(form);
      overlay.appendChild(card);
      overlay.onclick = (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
      };
      document.body.appendChild(overlay);

      const baseSelect = form.querySelector('#ccBaseCharacterId');
      const idInput = form.querySelector('#ccVariantId');
      const nameInput = form.querySelector('#ccVariantName');
      const hpInput = form.querySelector('#ccHp');
      const diceInput = form.querySelector('#ccDiceSides');
      const auroraInput = form.querySelector('#ccAuroraUses');
      const attackInput = form.querySelector('#ccAttackLevel');
      const defenseInput = form.querySelector('#ccDefenseLevel');
      const rerollInput = form.querySelector('#ccMaxAttackRerolls');

      const fillByBase = () => {
        const base = state.characters[baseSelect.value];
        if (!base) return;
        hpInput.value = String(base.hp);
        diceInput.value = (base.diceSides || []).join(',');
        auroraInput.value = String(base.auroraUses);
        attackInput.value = String(base.attackLevel);
        defenseInput.value = String(base.defenseLevel);
        rerollInput.value = String(base.maxAttackRerolls === undefined ? 2 : base.maxAttackRerolls);
        if (!idInput.value.trim()) idInput.value = suggestVariantId(base.id);
        if (!nameInput.value.trim()) nameInput.value = `${base.name} 变体`;
      };

      baseSelect.onchange = () => {
        idInput.value = '';
        nameInput.value = '';
        fillByBase();
      };

      form.onsubmit = (event) => {
        event.preventDefault();
        const base = state.characters[baseSelect.value];
        if (!base) return showErrorToast('母角色无效，请重新选择。');

        const variantId = String(idInput.value || '').trim();
        if (!/^[a-z0-9_]{3,40}$/.test(variantId)) {
          return showErrorToast('角色 ID 需要 3-40 位小写字母/数字/下划线。');
        }

        const hp = Number.parseInt(hpInput.value, 10);
        const auroraUses = Number.parseInt(auroraInput.value, 10);
        const attackLevel = Number.parseInt(attackInput.value, 10);
        const defenseLevel = Number.parseInt(defenseInput.value, 10);
        const maxAttackRerolls = Number.parseInt(rerollInput.value, 10);
        const diceSides = parseDiceSidesInput(diceInput.value);

        if (!Number.isInteger(hp) || hp <= 0) return showErrorToast('HP 必须是大于 0 的整数。');
        if (!Number.isInteger(auroraUses) || auroraUses < 0) return showErrorToast('曜彩次数必须是非负整数。');
        if (!Number.isInteger(attackLevel) || attackLevel <= 0) return showErrorToast('攻击等级必须是大于 0 的整数。');
        if (!Number.isInteger(defenseLevel) || defenseLevel <= 0) return showErrorToast('防御等级必须是大于 0 的整数。');
        if (!Number.isInteger(maxAttackRerolls) || maxAttackRerolls < 0) return showErrorToast('重投次数必须是非负整数。');
        if (!diceSides) return showErrorToast('骰面格式无效，请使用类似 8,8,6,6,4 的写法。');

        const overrides = {};
        if (hp !== base.hp) overrides.hp = hp;
        if ((base.diceSides || []).join(',') !== diceSides.join(',')) overrides.diceSides = diceSides;
        if (auroraUses !== base.auroraUses) overrides.auroraUses = auroraUses;
        if (attackLevel !== base.attackLevel) overrides.attackLevel = attackLevel;
        if (defenseLevel !== base.defenseLevel) overrides.defenseLevel = defenseLevel;
        if (maxAttackRerolls !== (base.maxAttackRerolls === undefined ? 2 : base.maxAttackRerolls)) {
          overrides.maxAttackRerolls = maxAttackRerolls;
        }
        if (!Object.keys(overrides).length) return showErrorToast('请至少修改一项数值后再保存。');

        send('create_custom_character', {
          variant: {
            id: variantId,
            baseCharacterId: base.id,
            name: String(nameInput.value || '').trim() || `${base.name} 变体`,
            overrides,
          },
        });
        overlay.classList.add('hidden');
      };

      return overlay;
    }

    function showCustomCharacterModal() {
      const baseCharacters = getBaseCharacterList();
      if (!baseCharacters.length) {
        showErrorToast('角色数据尚未加载完成，请稍后重试。');
        return;
      }

      const overlay = getCustomCharacterOverlay();
      const form = document.getElementById('customCharacterForm');
      if (!form) return;

      const baseSelect = form.querySelector('#ccBaseCharacterId');
      const idInput = form.querySelector('#ccVariantId');
      const nameInput = form.querySelector('#ccVariantName');
      const hpInput = form.querySelector('#ccHp');
      const diceInput = form.querySelector('#ccDiceSides');
      const auroraInput = form.querySelector('#ccAuroraUses');
      const attackInput = form.querySelector('#ccAttackLevel');
      const defenseInput = form.querySelector('#ccDefenseLevel');
      const rerollInput = form.querySelector('#ccMaxAttackRerolls');

      baseSelect.innerHTML = '';
      baseCharacters.forEach((c) => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = `${c.name} (${c.id})`;
        baseSelect.appendChild(option);
      });

      const me = findPlayer(state.me);
      const selectedId = state.ui.pendingCharacterId || (me && me.characterId) || baseCharacters[0].id;
      const selectedCharacter = state.characters[selectedId];
      const selectedBase = selectedCharacter && selectedCharacter.isCustomVariant
        ? selectedCharacter.baseCharacterId
        : selectedId;
      const fallbackBase = baseCharacters[0].id;
      baseSelect.value = baseCharacters.some((c) => c.id === selectedBase) ? selectedBase : fallbackBase;

      const base = state.characters[baseSelect.value] || baseCharacters[0];
      idInput.value = suggestVariantId(base.id);
      nameInput.value = `${base.name} 变体`;
      hpInput.value = String(base.hp);
      diceInput.value = (base.diceSides || []).join(',');
      auroraInput.value = String(base.auroraUses);
      attackInput.value = String(base.attackLevel);
      defenseInput.value = String(base.defenseLevel);
      rerollInput.value = String(base.maxAttackRerolls === undefined ? 2 : base.maxAttackRerolls);

      overlay.classList.remove('hidden');
    }

    return {
      showWinnerOverlay,
      hideWinnerOverlay,
      showErrorToast,
      showDocModal,
      showGuideModal,
      getWeatherDisplay,
      showWeatherBroadcast,
      showCustomCharacterModal,
    };
  }

  window.GPPModalController = {
    createModalController,
  };
})();

