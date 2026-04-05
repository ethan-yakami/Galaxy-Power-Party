(function() {
  const { state, dom, send } = GPP;

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

  function getWinnerOverlay() {
    let node = document.getElementById('winnerOverlay');
    if (!node) {
      node = document.createElement('div');
      node.id = 'winnerOverlay';
      node.className = 'winnerOverlay hidden';

      const card = document.createElement('div');
      card.className = 'winnerOverlayCard';

      const text = document.createElement('div');
      text.id = 'winnerOverlayText';
      text.className = 'winnerOverlayText';
      card.appendChild(text);

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
    }
    return node;
  }

  function showWinnerOverlay(text) {
    const node = getWinnerOverlay();
    const textNode = document.getElementById('winnerOverlayText');
    if (textNode) textNode.textContent = text;
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

    const msg = document.createElement('div');
    msg.className = 'errorToastMsg';
    msg.textContent = text || '发生错误';

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
    setTimeout(removeToast, 2600);
  }

  function buildDocContent() {
    const chars = Object.keys(state.characters).map((id) => state.characters[id]);
    const charSection = chars.length
      ? chars.map((c) => `<b>${c.name}</b> — HP ${c.hp} | ${c.shortSpec}\n技能：${c.skillText}`).join('\n\n')
      : '（加载中...）';

    const auroraSection = state.auroraDice.length
      ? state.auroraDice.map((a) => `<b>${a.name}</b> — 骰面：${a.facesText}\n${a.effectText}\n条件：${a.conditionText}`).join('\n\n')
      : '（加载中...）';

    return `<h2>游戏文档</h2>

<h3>基本规则</h3>
<p>银河战力党是一款 2 人回合制骰子对战游戏。双方各选一个角色和一颗曜彩骰，轮流进行攻防回合。</p>
<p><b>回合流程：</b></p>
<ol>
<li><b>攻击投掷</b> — 攻击方投掷所有骰子</li>
<li><b>攻击选择</b> — 攻击方可重投任意骰子（有次数限制），也可使用曜彩骰，最后选择指定数量的骰子确认攻击值</li>
<li><b>防守投掷</b> — 防守方投掷所有骰子</li>
<li><b>防守选择</b> — 防守方可使用曜彩骰，选择指定数量的骰子确认防守值</li>
<li><b>结算</b> — 攻击值 - 防守值 = 伤害（最低为 0），之后攻防互换进入下一回合</li>
</ol>
<p>某方 HP 降至 0 时游戏结束。</p>

<h3>名词解释</h3>
<dl>
<dt>攻击等级 / 防守等级</dt>
<dd>攻击/防守时需要选择的骰子数量。例如攻击等级 3 表示确认攻击时必须选 3 枚骰子。</dd>
<dt>曜彩骰</dt>
<dd>特殊的第 6 颗骰子，使用后加入骰池一起投掷。每局有使用次数限制。</dd>
<dt>A 效果</dt>
<dd>曜彩骰带有"A"标记的面。当带 A 的面被选中确认时，触发该曜彩骰的特殊效果。</dd>
<dt>洞穿</dt>
<dd>无视防守值和力场，直接造成攻击值等量的伤害。</dd>
<dt>力场</dt>
<dd>本回合不受常规攻击伤害（洞穿可穿透力场）。</dd>
<dt>瞬伤</dt>
<dd>立即造成的伤害，不经过攻防结算。</dd>
<dt>跃升</dt>
<dd>将所选骰子中最小点数变为该骰子的最大面值。</dd>
<dt>连击</dt>
<dd>本轮次额外进行一次基于当前攻击值的攻击。</dd>
<dt>中毒</dt>
<dd>在回合结算后，将会受到对应层数的伤害，随后使层数-1。</dd>
<dt>韧性</dt>
<dd>在防御时，提供对应层数的防守值加成。</dd>
<dt>反击</dt>
<dd>在受到攻击时，如果防守值更大，对攻击方造成差值伤害。</dd>
<dt>骇入</dt>
<dd>结算前，将对手已选择骰子中点数最大的一颗转变为2点（不会作用于曜彩骰）。</dd>
<dt>荆棘</dt>
<dd>在回合结算前，将会受到对应层数的伤害，结算后清除荆棘。</dd>
<dt>力量</dt>
<dd>在攻击时，提供对应层数的攻击值加成。</dd>
<dt>命定</dt>
<dd>持有此效果的骰子投出后必须被选中使用，不可跳过。</dd>
<dt>超载</dt>
<dd>攻击时附加与层数相同的攻击值加成；防御时对自己造成层数50%的伤害（向上取整）。</dd>
<dt>不屈</dt>
<dd>生效期间，始终保留至少1点生命值，任何伤害均不会使 HP 降至 0 以下。</dd>
<dt>背水</dt>
<dd>将自身生命值降低为1，获得等于降低值的点数加成。</dd>
</dl>

<h3>角色一览</h3>
<p class="docNote">格式：角色名 — HP | 骰池 A次数 攻等+防等</p>
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

  // --- Glossary tooltip system ---

  const GLOSSARY = {
    '攻击等级': '攻击时需要选择的骰子数量。例如攻击等级3表示确认攻击时必须选3枚骰子。',
    '防守等级': '防守时需要选择的骰子数量。例如防守等级2表示确认防守时必须选2枚骰子。',
    '曜彩骰': '特殊的第6颗骰子，使用后加入骰池一起投掷。每局有使用次数限制。',
    'A触发': '曜彩骰A效果的累计触发次数。曜彩骰带有"A"标记的面被选中时触发特殊效果。',
    '力场': '本回合不受常规攻击伤害（洞穿可穿透力场）。',
    '洞穿': '无视防守值和力场，直接造成攻击值等量的伤害。',
    '瞬伤': '立即造成的伤害，不经过攻防结算。',
    '跃升': '将所选骰子中最小点数变为该骰子的最大面值。',
    '连击': '本轮次额外进行一次基于当前攻击值的攻击。',
    '中毒': '回合结算后受到对应层数的伤害，随后层数-1。',
    '韧性': '防御时提供对应层数的防守值加成。满7层时对对手瞬伤7点并移除7层。',
    '反击准备': '下次防御时获得反击效果（防守值>攻击值时对攻击方造成差值伤害）。',
    '反击': '防守值大于攻击值时，对攻击方造成差值伤害。',
    '骇入': '结算前，将对手已选择骰子中点数最大的一颗变为2点（不作用于曜彩骰）。',
    '荆棘': '回合结算前受到对应层数的自伤，结算后清除荆棘。',
    '力量': '攻击时提供对应层数的攻击值加成。',
    '命定': '持有此效果的骰子投出后必须被选中使用，不可跳过。',
    '超载': '攻击时附加与层数相同的攻击值加成；防御时对自己造成层数50%的伤害（向上取整）。',
    '不屈': '本回合HP不会降至0以下，始终保留至少1点生命值。',
    '背水': '将自身HP降为1，获得等于降低值的攻击加成。',
  };

  // Sorted by length desc to avoid partial matches (e.g. "反击准备" before "反击")
  const _glossTerms = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  const _glossRegex = new RegExp('(' + _glossTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function wrapGlossaryTerms(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(_glossRegex, (match) => {
      const desc = escapeHtml(GLOSSARY[match]);
      return `<span class="glossTip">${match}<span class="glossTipText">${desc}</span></span>`;
    });
  }

  function charTooltipHtml(characterId, characterName) {
    const c = state.characters[characterId];
    if (!c) return escapeHtml(characterName || '');
    return '<span class="glossTip">' + escapeHtml(c.name)
      + '<span class="glossTipText">'
      + escapeHtml('HP ' + c.hp + ' | ' + c.shortSpec)
      + '<br>' + escapeHtml('技能：' + c.skillText)
      + '</span></span>';
  }

  function auroraTooltipHtml(auroraDiceId, auroraDiceName) {
    if (!auroraDiceId || !auroraDiceName) return escapeHtml(auroraDiceName || '无');
    const a = state.auroraDice.find((d) => d.id === auroraDiceId);
    if (!a) return escapeHtml(auroraDiceName);
    return '<span class="glossTip">' + escapeHtml(a.name)
      + '<span class="glossTipText">'
      + escapeHtml('骰面：' + a.facesText)
      + '<br>' + escapeHtml(a.effectText)
      + '<br>' + escapeHtml('条件：' + a.conditionText)
      + '</span></span>';
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
    wrapGlossaryTerms,
    charTooltipHtml,
    auroraTooltipHtml,
  });
})();
