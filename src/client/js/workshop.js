(function() {
  const urls = window.GPPUrls || {
    getBasePath() {
      return '/';
    },
    toWsUrl(_locationRef, wsProtocol) {
      return `${wsProtocol}//${location.host}/`;
    },
  };
  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

  const dom = {
    backBtn: document.getElementById('backBtn'),
    reconnectBtn: document.getElementById('reconnectBtn'),
    connBadge: document.getElementById('connBadge'),
    playerIdBadge: document.getElementById('playerIdBadge'),
    formTitle: document.getElementById('formTitle'),
    form: document.getElementById('workshopForm'),
    resetBtn: document.getElementById('resetBtn'),
    duplicateBtn: document.getElementById('duplicateBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    baseCharacterId: document.getElementById('baseCharacterId'),
    variantId: document.getElementById('variantId'),
    variantName: document.getElementById('variantName'),
    hp: document.getElementById('hp'),
    diceSides: document.getElementById('diceSides'),
    auroraUses: document.getElementById('auroraUses'),
    attackLevel: document.getElementById('attackLevel'),
    defenseLevel: document.getElementById('defenseLevel'),
    maxAttackRerolls: document.getElementById('maxAttackRerolls'),
    submitBtn: document.getElementById('submitBtn'),
    workshopMessage: document.getElementById('workshopMessage'),
    basePreview: document.getElementById('basePreview'),
    variantList: document.getElementById('variantList'),
  };

  let ws = null;
  let connected = false;
  let characters = {};
  let variants = [];
  let selectedVariantId = '';

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtTime(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '-';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return '-';
    }
  }

  function setConn(text, isError) {
    if (!dom.connBadge) return;
    dom.connBadge.textContent = text;
    dom.connBadge.classList.toggle('error', !!isError);
  }

  function setMessage(text, isError) {
    if (!dom.workshopMessage) return;
    dom.workshopMessage.textContent = text || '';
    dom.workshopMessage.classList.toggle('error', !!isError);
  }

  function setSubmitEnabled(enabled) {
    if (!dom.submitBtn) return;
    dom.submitBtn.disabled = !enabled;
  }

  function setFormTitle(text) {
    if (dom.formTitle) dom.formTitle.textContent = text;
  }

  function toInt(value) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
    return null;
  }

  function parseDiceSides(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
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

  function getBaseCharacters() {
    return Object.keys(characters)
      .map((id) => characters[id])
      .filter((character) => character && !character.isCustomVariant)
      .sort((left, right) => String(left.name).localeCompare(String(right.name), 'zh-Hans-CN'));
  }

  function getBaseCharacter(baseCharacterId) {
    return characters[String(baseCharacterId || '').trim()] || null;
  }

  function getVariantById(variantId) {
    const safeId = String(variantId || '').trim();
    if (!safeId) return null;
    return variants.find((item) => item && item.id === safeId) || null;
  }

  function suggestVariantId(baseCharacterId, excludeId) {
    const prefix = `${baseCharacterId}_v`;
    let maxN = 1;
    variants.forEach((variant) => {
      if (!variant || variant.id === excludeId || !variant.id.startsWith(prefix)) return;
      const tail = variant.id.slice(prefix.length);
      const n = Number(tail);
      if (Number.isInteger(n) && n >= maxN) {
        maxN = n + 1;
      }
    });
    return `${prefix}${maxN}`;
  }

  function setFormValues(base, variant) {
    if (!base) return;
    const overrides = variant && variant.overrides && typeof variant.overrides === 'object'
      ? variant.overrides
      : {};
    if (dom.baseCharacterId) dom.baseCharacterId.value = base.id;
    if (dom.variantId) dom.variantId.value = variant ? variant.id : suggestVariantId(base.id);
    if (dom.variantName) dom.variantName.value = variant ? (variant.name || base.name) : `${base.name} 变体`;
    if (dom.hp) dom.hp.value = String(overrides.hp === undefined ? base.hp : overrides.hp);
    if (dom.diceSides) dom.diceSides.value = Array.isArray(overrides.diceSides) ? overrides.diceSides.join(',') : (base.diceSides || []).join(',');
    if (dom.auroraUses) dom.auroraUses.value = String(overrides.auroraUses === undefined ? base.auroraUses : overrides.auroraUses);
    if (dom.attackLevel) dom.attackLevel.value = String(overrides.attackLevel === undefined ? base.attackLevel : overrides.attackLevel);
    if (dom.defenseLevel) dom.defenseLevel.value = String(overrides.defenseLevel === undefined ? base.defenseLevel : overrides.defenseLevel);
    if (dom.maxAttackRerolls) {
      const baseValue = base.maxAttackRerolls === undefined ? 2 : base.maxAttackRerolls;
      dom.maxAttackRerolls.value = String(overrides.maxAttackRerolls === undefined ? baseValue : overrides.maxAttackRerolls);
    }
  }

  function renderBasePreview(base, variant) {
    if (!dom.basePreview) return;
    if (!base) {
      dom.basePreview.textContent = '等待角色目录加载...';
      return;
    }
    const overrides = variant && variant.overrides && typeof variant.overrides === 'object'
      ? Object.keys(variant.overrides)
      : [];
    dom.basePreview.textContent = [
      `母角色：${base.name} (${base.id})`,
      `基础规格：HP ${base.hp} | ${base.shortSpec || ''}`,
      `技能：${base.skillText || '无'}`,
      variant
        ? `当前变体：${variant.name || variant.id} | ${variant.enabled === false ? '已禁用' : '已启用'}`
        : '当前表单：新建变体',
      variant && overrides.length ? `覆盖字段：${overrides.join(', ')}` : '覆盖字段：-',
    ].join('\n');
  }

  function fillFormByBase(base) {
    selectedVariantId = '';
    setFormTitle('新建自定义角色');
    setFormValues(base, null);
    renderBasePreview(base, null);
  }

  function fillFormByVariant(variant) {
    if (!variant) return;
    const base = getBaseCharacter(variant.baseCharacterId);
    if (!base) {
      setMessage(`无法加载母角色 ${variant.baseCharacterId}，请先检查角色目录。`, true);
      return;
    }
    selectedVariantId = variant.id;
    setFormTitle(`编辑：${variant.name || variant.id}`);
    setFormValues(base, variant);
    renderBasePreview(base, variant);
  }

  function prepareDuplicate(variant) {
    if (variant) {
      const base = getBaseCharacter(variant.baseCharacterId);
      if (!base) return;
      selectedVariantId = '';
      setFormTitle(`复制：${variant.name || variant.id}`);
      setFormValues(base, variant);
      if (dom.variantId) dom.variantId.value = suggestVariantId(base.id, variant.id);
      if (dom.variantName) dom.variantName.value = `${variant.name || base.name} 副本`;
      renderBasePreview(base, null);
      setMessage(`已载入 ${variant.name || variant.id}，请修改后保存为新角色。`, false);
      return;
    }
    const base = getBaseCharacter(dom.baseCharacterId ? dom.baseCharacterId.value : '');
    if (!base) return;
    selectedVariantId = '';
    setFormTitle(`复制：${base.name}`);
    setFormValues(base, null);
    if (dom.variantName) dom.variantName.value = `${base.name} 副本`;
    renderBasePreview(base, null);
    setMessage(`已基于 ${base.name} 准备一个新变体。`, false);
  }

  function refreshBaseOptions(preferredBaseId) {
    if (!dom.baseCharacterId) return;
    const baseList = getBaseCharacters();
    dom.baseCharacterId.innerHTML = '';

    if (!baseList.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '暂无可用母角色';
      dom.baseCharacterId.appendChild(option);
      renderBasePreview(null, null);
      setSubmitEnabled(false);
      return;
    }

    baseList.forEach((character) => {
      const option = document.createElement('option');
      option.value = character.id;
      option.textContent = `${character.name} (${character.id})`;
      dom.baseCharacterId.appendChild(option);
    });

    const targetBaseId = baseList.some((character) => character.id === preferredBaseId)
      ? preferredBaseId
      : baseList[0].id;
    dom.baseCharacterId.value = targetBaseId;

    const selectedVariant = getVariantById(selectedVariantId);
    if (selectedVariant && selectedVariant.baseCharacterId === targetBaseId) {
      fillFormByVariant(selectedVariant);
    } else {
      fillFormByBase(getBaseCharacter(targetBaseId));
    }
    setSubmitEnabled(connected);
  }

  function renderVariantList() {
    if (!dom.variantList) return;
    dom.variantList.innerHTML = '';

    if (!variants.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '还没有自定义角色，先从左侧创建一个吧。';
      dom.variantList.appendChild(empty);
      return;
    }

    variants.forEach((variant) => {
      const item = document.createElement('article');
      item.className = `panel${variant.id === selectedVariantId ? ' active' : ''}`;

      const base = getBaseCharacter(variant.baseCharacterId);
      item.innerHTML = [
        `<div><strong>${escapeHtml(variant.name || variant.id)}</strong></div>`,
        `<div class="hint">ID: ${escapeHtml(variant.id)}</div>`,
        `<div class="hint">母角色: ${escapeHtml(base ? base.name : variant.baseCharacterId)}</div>`,
        `<div class="hint">状态: ${variant.enabled === false ? '禁用' : '启用'} | 更新时间: ${escapeHtml(fmtTime(variant.updatedAt))}</div>`,
      ].join('');

      const actions = document.createElement('div');
      actions.className = 'formActions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'secondaryBtn';
      editBtn.textContent = '编辑';
      editBtn.onclick = () => fillFormByVariant(variant);

      const duplicateBtn = document.createElement('button');
      duplicateBtn.type = 'button';
      duplicateBtn.className = 'secondaryBtn';
      duplicateBtn.textContent = '复制';
      duplicateBtn.onclick = () => prepareDuplicate(variant);

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'secondaryBtn';
      toggleBtn.textContent = variant.enabled === false ? '启用' : '禁用';
      toggleBtn.onclick = () => {
        if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
          setMessage('连接未就绪，请先重连工坊。', true);
          return;
        }
        ws.send(JSON.stringify({
          type: 'toggle_custom_character',
          characterId: variant.id,
          enabled: variant.enabled === false,
        }));
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'secondaryBtn';
      deleteBtn.textContent = '删除';
      deleteBtn.onclick = () => {
        if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
          setMessage('连接未就绪，请先重连工坊。', true);
          return;
        }
        if (window.confirm(`确认删除 ${variant.name || variant.id} 吗？`)) {
          ws.send(JSON.stringify({
            type: 'delete_custom_character',
            characterId: variant.id,
          }));
        }
      };

      actions.appendChild(editBtn);
      actions.appendChild(duplicateBtn);
      actions.appendChild(toggleBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(actions);
      dom.variantList.appendChild(item);
    });
  }

  function applyCharacterCatalog(nextList) {
    const oldBaseId = dom.baseCharacterId ? dom.baseCharacterId.value : '';
    characters = {};
    (nextList || []).forEach((character) => {
      if (!character || !character.id) return;
      characters[character.id] = character;
    });
    refreshBaseOptions(oldBaseId);
    renderVariantList();
  }

  function applyVariantList(nextList) {
    variants = (nextList || [])
      .filter((variant) => variant && variant.id)
      .sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id), 'zh-Hans-CN'));
    if (selectedVariantId && !getVariantById(selectedVariantId)) {
      selectedVariantId = '';
      fillFormByBase(getBaseCharacter(dom.baseCharacterId ? dom.baseCharacterId.value : ''));
    }
    renderVariantList();
  }

  function requestVariantList() {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'list_custom_characters' }));
  }

  function buildVariantPayload() {
    const baseCharacterId = String(dom.baseCharacterId ? dom.baseCharacterId.value : '').trim();
    const base = getBaseCharacter(baseCharacterId);
    if (!base || base.isCustomVariant) {
      return { ok: false, error: '请选择一个有效的母角色。' };
    }

    const variantId = String(dom.variantId ? dom.variantId.value : '').trim();
    if (!/^[a-z0-9_]{3,40}$/.test(variantId)) {
      return { ok: false, error: '角色 ID 需要是 3-40 位小写字母、数字或下划线。' };
    }

    const hp = toInt(dom.hp ? dom.hp.value : '');
    const auroraUses = toInt(dom.auroraUses ? dom.auroraUses.value : '');
    const attackLevel = toInt(dom.attackLevel ? dom.attackLevel.value : '');
    const defenseLevel = toInt(dom.defenseLevel ? dom.defenseLevel.value : '');
    const maxAttackRerolls = toInt(dom.maxAttackRerolls ? dom.maxAttackRerolls.value : '');
    const diceSides = parseDiceSides(dom.diceSides ? dom.diceSides.value : '');

    if (hp === null || hp <= 0) return { ok: false, error: 'HP 必须是大于 0 的整数。' };
    if (auroraUses === null || auroraUses < 0) return { ok: false, error: '曙彩使用次数必须是非负整数。' };
    if (attackLevel === null || attackLevel <= 0) return { ok: false, error: '攻击等级必须是大于 0 的整数。' };
    if (defenseLevel === null || defenseLevel <= 0) return { ok: false, error: '防御等级必须是大于 0 的整数。' };
    if (maxAttackRerolls === null || maxAttackRerolls < 0) return { ok: false, error: '重投上限必须是非负整数。' };
    if (!diceSides) return { ok: false, error: '普通骰面格式无效，请使用逗号分隔的整数，例如 8,8,6,6,4。' };

    const baseRerolls = base.maxAttackRerolls === undefined ? 2 : base.maxAttackRerolls;
    const overrides = {};
    if (hp !== base.hp) overrides.hp = hp;
    if ((base.diceSides || []).join(',') !== diceSides.join(',')) overrides.diceSides = diceSides;
    if (auroraUses !== base.auroraUses) overrides.auroraUses = auroraUses;
    if (attackLevel !== base.attackLevel) overrides.attackLevel = attackLevel;
    if (defenseLevel !== base.defenseLevel) overrides.defenseLevel = defenseLevel;
    if (maxAttackRerolls !== baseRerolls) overrides.maxAttackRerolls = maxAttackRerolls;

    if (!Object.keys(overrides).length) {
      return { ok: false, error: '请至少修改一个数值后再保存。' };
    }

    return {
      ok: true,
      variant: {
        id: variantId,
        baseCharacterId: base.id,
        name: String(dom.variantName ? dom.variantName.value : '').trim() || `${base.name} 变体`,
        enabled: true,
        overrides,
      },
      isUpdate: !!(selectedVariantId && selectedVariantId === variantId && getVariantById(variantId)),
    };
  }

  function sendSaveRequest() {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      setMessage('连接未就绪，请先重连工坊。', true);
      return;
    }

    const result = buildVariantPayload();
    if (!result.ok) {
      setMessage(result.error, true);
      return;
    }

    ws.send(JSON.stringify({
      type: result.isUpdate ? 'update_custom_character' : 'create_custom_character',
      variant: result.variant,
    }));
    setMessage(`${result.isUpdate ? '更新' : '创建'}请求已提交：${result.variant.name} (${result.variant.id})`, false);
  }

  function connect() {
    connected = false;
    setSubmitEnabled(false);
    setConn('连接中', false);

    if (!location.host) {
      setConn('连接失败', true);
      setMessage('当前页面缺少 host，无法连接服务端。', true);
      return;
    }

    ws = new WebSocket(urls.toWsUrl(location, wsProtocol));

    ws.onopen = () => {
      connected = true;
      setConn('已连接', false);
      setSubmitEnabled(true);
      setMessage('已连接服务端，等待角色目录加载...');
    };

    ws.onerror = () => {
      setConn('连接异常', true);
      setMessage('连接出现异常，请点击“重连”。', true);
    };

    ws.onclose = () => {
      connected = false;
      setSubmitEnabled(false);
      setConn('连接断开', true);
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data || ''));
      } catch {
        return;
      }

      if (msg.type === 'welcome') {
        if (dom.playerIdBadge) {
          dom.playerIdBadge.textContent = `玩家 ID: ${msg.playerId || '-'}`;
        }
        applyCharacterCatalog(msg.characters || []);
        requestVariantList();
        setMessage('角色目录已加载。', false);
        return;
      }

      if (msg.type === 'characters_updated') {
        applyCharacterCatalog(msg.characters || []);
        requestVariantList();
        setMessage('角色目录已刷新。', false);
        return;
      }

      if (msg.type === 'custom_characters_list') {
        applyVariantList(msg.characters || []);
        setMessage('自定义角色列表已刷新。', false);
        return;
      }

      if (msg.type === 'custom_character_created') {
        requestVariantList();
        setMessage(`创建成功：${msg.id || '自定义角色'}`, false);
        return;
      }

      if (msg.type === 'custom_character_updated') {
        requestVariantList();
        setMessage(`更新成功：${msg.id || msg.characterId || '自定义角色'}`, false);
        return;
      }

      if (msg.type === 'custom_character_deleted') {
        if (selectedVariantId && selectedVariantId === msg.characterId) {
          selectedVariantId = '';
        }
        requestVariantList();
        setMessage(`已删除：${msg.characterId || '自定义角色'}`, false);
        return;
      }

      if (msg.type === 'error') {
        setMessage(msg.message || '操作失败。', true);
      }
    };
  }

  if (dom.backBtn) {
    dom.backBtn.onclick = () => {
      location.href = urls.getBasePath(location);
    };
  }

  if (dom.reconnectBtn) {
    dom.reconnectBtn.onclick = () => {
      try {
        if (ws) ws.close();
      } catch {}
      connect();
    };
  }

  if (dom.baseCharacterId) {
    dom.baseCharacterId.onchange = () => {
      fillFormByBase(getBaseCharacter(dom.baseCharacterId.value));
    };
  }

  if (dom.resetBtn) {
    dom.resetBtn.onclick = () => {
      fillFormByBase(getBaseCharacter(dom.baseCharacterId ? dom.baseCharacterId.value : ''));
      setMessage('表单已重置。', false);
    };
  }

  if (dom.duplicateBtn) {
    dom.duplicateBtn.onclick = () => {
      const currentVariant = getVariantById(selectedVariantId);
      prepareDuplicate(currentVariant);
    };
  }

  if (dom.refreshBtn) {
    dom.refreshBtn.onclick = () => {
      requestVariantList();
    };
  }

  if (dom.form) {
    dom.form.onsubmit = (event) => {
      event.preventDefault();
      sendSaveRequest();
    };
  }

  connect();
})();
