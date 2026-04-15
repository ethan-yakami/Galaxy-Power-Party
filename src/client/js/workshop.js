(function() {
  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

  const dom = {
    backBtn: document.getElementById('backBtn'),
    reconnectBtn: document.getElementById('reconnectBtn'),
    connBadge: document.getElementById('connBadge'),
    playerIdBadge: document.getElementById('playerIdBadge'),
    form: document.getElementById('workshopForm'),
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
  };

  let ws = null;
  let connected = false;
  let characters = {};

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function toInt(value) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
    return null;
  }

  function parseDiceSides(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return null;

    const values = [];
    for (const p of parts) {
      if (!/^-?\d+$/.test(p)) return null;
      const n = Number(p);
      if (!Number.isInteger(n) || n < 2) return null;
      values.push(n);
    }
    return values;
  }

  function getBaseCharacters() {
    return Object.keys(characters)
      .map((id) => characters[id])
      .filter((c) => c && !c.isCustomVariant)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));
  }

  function suggestVariantId(baseCharacterId) {
    const prefix = `${baseCharacterId}_v`;
    let maxN = 1;
    Object.keys(characters).forEach((id) => {
      if (!id.startsWith(prefix)) return;
      const tail = id.slice(prefix.length);
      const n = Number(tail);
      if (Number.isInteger(n) && n >= maxN) {
        maxN = n + 1;
      }
    });
    return `${prefix}${maxN}`;
  }

  function renderBasePreview(base) {
    if (!dom.basePreview) return;
    if (!base) {
      dom.basePreview.textContent = '等待角色目录加载...';
      return;
    }

    dom.basePreview.innerHTML = [
      `母角色：${escapeHtml(base.name)} (${escapeHtml(base.id)})`,
      `规格：HP ${escapeHtml(base.hp)} | ${escapeHtml(base.shortSpec || '')}`,
      `技能：${escapeHtml(base.skillText || '无')}`,
    ].join('\n');
  }

  function fillFormByBase(base) {
    if (!base) return;
    if (dom.variantId) dom.variantId.value = suggestVariantId(base.id);
    if (dom.variantName) dom.variantName.value = `${base.name} 变体`;
    if (dom.hp) dom.hp.value = String(base.hp);
    if (dom.diceSides) dom.diceSides.value = (base.diceSides || []).join(',');
    if (dom.auroraUses) dom.auroraUses.value = String(base.auroraUses);
    if (dom.attackLevel) dom.attackLevel.value = String(base.attackLevel);
    if (dom.defenseLevel) dom.defenseLevel.value = String(base.defenseLevel);
    if (dom.maxAttackRerolls) {
      dom.maxAttackRerolls.value = String(base.maxAttackRerolls === undefined ? 2 : base.maxAttackRerolls);
    }
    renderBasePreview(base);
  }

  function refreshBaseOptions(preferredId) {
    if (!dom.baseCharacterId) return;
    const baseList = getBaseCharacters();
    dom.baseCharacterId.innerHTML = '';

    if (!baseList.length) {
      const op = document.createElement('option');
      op.value = '';
      op.textContent = '暂无可用母角色';
      dom.baseCharacterId.appendChild(op);
      renderBasePreview(null);
      setSubmitEnabled(false);
      return;
    }

    for (const c of baseList) {
      const op = document.createElement('option');
      op.value = c.id;
      op.textContent = `${c.name} (${c.id})`;
      dom.baseCharacterId.appendChild(op);
    }

    const targetId = baseList.some((c) => c.id === preferredId) ? preferredId : baseList[0].id;
    dom.baseCharacterId.value = targetId;
    fillFormByBase(characters[targetId]);
    setSubmitEnabled(connected);
  }

  function applyCharacterCatalog(nextList) {
    const oldBaseId = dom.baseCharacterId ? dom.baseCharacterId.value : '';
    characters = {};
    (nextList || []).forEach((c) => {
      characters[c.id] = c;
    });
    refreshBaseOptions(oldBaseId);
  }

  function sendCreateRequest() {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      setMessage('连接未就绪，请先重连工坊。', true);
      return;
    }

    const baseCharacterId = String(dom.baseCharacterId ? dom.baseCharacterId.value : '').trim();
    const base = characters[baseCharacterId];
    if (!base || base.isCustomVariant) {
      setMessage('母角色无效，请重新选择。', true);
      return;
    }

    const variantId = String(dom.variantId ? dom.variantId.value : '').trim();
    if (!/^[a-z0-9_]{3,40}$/.test(variantId)) {
      setMessage('角色 ID 需为 3-40 位小写字母/数字/下划线。', true);
      return;
    }

    const hp = toInt(dom.hp ? dom.hp.value : '');
    const auroraUses = toInt(dom.auroraUses ? dom.auroraUses.value : '');
    const attackLevel = toInt(dom.attackLevel ? dom.attackLevel.value : '');
    const defenseLevel = toInt(dom.defenseLevel ? dom.defenseLevel.value : '');
    const maxAttackRerolls = toInt(dom.maxAttackRerolls ? dom.maxAttackRerolls.value : '');
    const diceSides = parseDiceSides(dom.diceSides ? dom.diceSides.value : '');

    if (hp === null || hp <= 0) return setMessage('HP 必须为大于 0 的整数。', true);
    if (auroraUses === null || auroraUses < 0) return setMessage('曜彩使用次数必须为非负整数。', true);
    if (attackLevel === null || attackLevel <= 0) return setMessage('攻击等级必须为大于 0 的整数。', true);
    if (defenseLevel === null || defenseLevel <= 0) return setMessage('防御等级必须为大于 0 的整数。', true);
    if (maxAttackRerolls === null || maxAttackRerolls < 0) return setMessage('重投上限必须为非负整数。', true);
    if (!diceSides) return setMessage('普通骰面格式无效，请用逗号分隔正整数（>=2）。', true);

    const baseRerolls = base.maxAttackRerolls === undefined ? 2 : base.maxAttackRerolls;
    const overrides = {};
    if (hp !== base.hp) overrides.hp = hp;
    if ((base.diceSides || []).join(',') !== diceSides.join(',')) overrides.diceSides = diceSides;
    if (auroraUses !== base.auroraUses) overrides.auroraUses = auroraUses;
    if (attackLevel !== base.attackLevel) overrides.attackLevel = attackLevel;
    if (defenseLevel !== base.defenseLevel) overrides.defenseLevel = defenseLevel;
    if (maxAttackRerolls !== baseRerolls) overrides.maxAttackRerolls = maxAttackRerolls;

    if (!Object.keys(overrides).length) {
      setMessage('请至少修改一项数值后再保存。', true);
      return;
    }

    const name = String(dom.variantName ? dom.variantName.value : '').trim() || `${base.name} 变体`;
    const payload = {
      type: 'create_custom_character',
      variant: {
        id: variantId,
        baseCharacterId: base.id,
        name,
        overrides,
      },
    };

    ws.send(JSON.stringify(payload));
    setMessage(`已提交创建请求：${name} (${variantId})`);
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

    const url = `${wsProtocol}//${location.host}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      connected = true;
      setConn('已连接', false);
      setSubmitEnabled(true);
      setMessage('已连接服务端，等待角色目录...');
    };

    ws.onerror = () => {
      setConn('连接异常', true);
      setMessage('连接出现异常，请点击“重连工坊”。', true);
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
          dom.playerIdBadge.textContent = `玩家ID：${msg.playerId || '-'}`;
        }
        applyCharacterCatalog(msg.characters || []);
        setMessage('角色目录已加载。');
        return;
      }

      if (msg.type === 'characters_updated') {
        applyCharacterCatalog(msg.characters || []);
        setMessage('角色目录已刷新，联机玩家可立即看到新角色。');
        return;
      }

      if (msg.type === 'custom_character_created') {
        const text = `创建成功：${msg.name || msg.characterId || '自定义角色'}`;
        setMessage(text);
        const base = characters[String(dom.baseCharacterId ? dom.baseCharacterId.value : '').trim()];
        if (base && dom.variantId) {
          dom.variantId.value = suggestVariantId(base.id);
        }
        return;
      }

      if (msg.type === 'error') {
        setMessage(msg.message || '操作失败。', true);
      }
    };
  }

  if (dom.backBtn) {
    dom.backBtn.onclick = () => {
      location.href = '/';
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
      const base = characters[String(dom.baseCharacterId.value || '').trim()];
      fillFormByBase(base);
    };
  }

  if (dom.form) {
    dom.form.onsubmit = (event) => {
      event.preventDefault();
      sendCreateRequest();
    };
  }

  connect();
})();
