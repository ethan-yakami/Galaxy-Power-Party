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

  const WEATHER_STAGE_ORDER = [2, 4, 6, 8];
  const WEATHER_TYPE_CLASS = {
    '坚守': 'guard',
    '助力': 'assist',
    '进攻': 'offense',
    '逆转': 'reverse',
  };
  const weatherGuideData = {
    introRules: [
      '第1回合无天气。',
      '在回合2/4/6/8开始前切换天气。',
      '每个阶段会从对应候选池随机生效1个天气。',
      '当前对局已接入天气系统，以下内容与实装规则同步。',
    ],
    stages: {
      2: [
        {
          name: '霜',
          type: '坚守',
          timing: '攻击确认后（onAttackSelect）',
          condition: '攻击方本次选骰包含相同点数。',
          effect: '下回合其防御等级 +1（阶段性临时修正）。',
        },
        {
          name: '青蛙雨',
          type: '助力',
          timing: '掷骰阶段',
          condition: '任一方掷骰结果出现最小值。',
          effect: '双方所有骰子都不会出现最小值。',
        },
        {
          name: '细雪',
          type: '坚守',
          timing: '回合开始（onRoundStart）',
          condition: '攻击方上一攻击回合未进行重投。',
          effect: '获得3层仅下回合可用的韧性。',
        },
        {
          name: '鱼雨',
          type: '助力',
          timing: '攻击确认/防守确认',
          condition: '任一方完成攻击或防守选骰确认。',
          effect: '双方当前回合额外获得1次重投机会。',
        },
        {
          name: '幻日',
          type: '进攻',
          timing: '重投动作触发',
          condition: '当前天气为幻日且执行重投。',
          effect: '额外提供2次重投机会；每次重投都会施加2层荆棘。',
        },
        {
          name: '飓风',
          type: '进攻',
          timing: '攻击确认后（onAttackSelect）',
          condition: '任一方完成攻击选骰确认。',
          effect: '该次攻击获得1次连击。',
        },
        {
          name: '雨夹雪',
          type: '助力',
          timing: '回合开始（onRoundStart）',
          condition: '生命值不为满的玩家。',
          effect: '获得反击准备，并使防御等级 +2（阶段性临时修正）。',
        },
        {
          name: '日食',
          type: '进攻',
          timing: '攻击确认后（onAttackSelect）',
          condition: '本次选中的骰子包含不同点数。',
          effect: '攻击值 +4。',
        },
        {
          name: '雷雨',
          type: '助力',
          timing: '攻击确认/防守确认',
          condition: '攻击确认时作用攻方，防守确认时作用守方。',
          effect: '攻击方攻击值 +4，防守方防御值 +4。',
        },
      ],
      4: [
        {
          name: '暴雪',
          type: '坚守',
          timing: '防守确认后（onDefenseSelect）',
          condition: '防御方本次防御值 < 8。',
          effect: '防御方本回合获得力场。',
        },
        {
          name: '烈日',
          type: '进攻',
          timing: '伤害结算后（onAfterDamageResolved）',
          condition: '本次造成了有效伤害。',
          effect: '触发虹吸：回复 floor(伤害*0.5) 的生命值，不超过最大生命值。',
        },
        {
          name: '酸雨',
          type: '助力',
          timing: '回合开始（onRoundStart）',
          condition: '场上生命值更多的一方（平血不触发）。',
          effect: '附加1层中毒。',
        },
        {
          name: '高温',
          type: '进攻',
          timing: '回合开始（onRoundStart）',
          condition: '场上生命值更少的一方。',
          effect: '获得2层力量，持续到本次天气结束。',
        },
        {
          name: '暴雨',
          type: '逆转',
          timing: '阶段切入（onStageEnter）',
          condition: '进入回合4阶段时。',
          effect: '双方攻击等级 +1，防御等级 +1（阶段性临时修正）。',
        },
        {
          name: '中雪',
          type: '坚守',
          timing: '攻击确认/防守确认',
          condition: '本次选骰包含3个相同点数。',
          effect: '治愈10点生命值（不超过最大生命值）。',
        },
        {
          name: '大雪',
          type: '坚守',
          timing: '攻击确认/防守确认',
          condition: '本次选骰中包含7。',
          effect: '攻击值/防御值 +4。',
        },
        {
          name: '沙尘',
          type: '进攻',
          timing: '攻击确认后（onAttackSelect）',
          condition: '攻击方本次选骰点数全为奇数。',
          effect: '攻击方获得3层力量。',
        },
      ],
      6: [
        {
          name: '云海',
          type: '助力',
          timing: '阶段切入（onStageEnter）',
          condition: '切入本天气时。',
          effect: '双方获得1次曜彩骰使用次数。',
        },
        {
          name: '彩虹',
          type: '进攻',
          timing: '攻击确认后（onAttackSelect）',
          condition: '攻击值 <= 10。',
          effect: '本次攻击获得洞穿。',
        },
        {
          name: '干旱',
          type: '进攻',
          timing: '攻击确认后（onAttackSelect）',
          condition: '根据对方当前防御等级计算。',
          effect: '每一级防御等级为攻击方附加3点攻击值。',
        },
        {
          name: '日月同辉',
          type: '逆转',
          timing: '攻击确认后（onAttackSelect）',
          condition: '攻击方当前生命值 <= 3。',
          effect: '攻击值翻倍。',
        },
        {
          name: '云隙光',
          type: '进攻',
          timing: '攻击确认后（onAttackSelect）',
          condition: '生命值更少的玩家执行攻击（同血不触发）。',
          effect: '该次攻击获得连击。',
        },
        {
          name: '时空暴',
          type: '逆转',
          timing: '伤害结算后（onAfterDamageResolved）',
          condition: '攻击方本次选骰点数全为6。',
          effect: '本次结算后双方生命值互换。',
        },
        {
          name: '晴天雨',
          type: '进攻',
          timing: '掷骰阶段',
          condition: '防守方掷骰时。',
          effect: '防守方骰子无法掷出最大值。',
        },
      ],
      8: [
        {
          name: '晴',
          type: '进攻',
          timing: '阶段切入（onStageEnter）',
          condition: '切入本天气时。',
          effect: '双方获得5层力量，持续到本次天气结束。',
        },
        {
          name: '晴雷',
          type: '逆转',
          timing: '攻击确认后（onAttackSelect）',
          condition: '攻击方完成攻击选骰确认。',
          effect: '直接造成3点瞬伤。',
        },
        {
          name: '毒雾',
          type: '逆转',
          timing: '阶段切入（onStageEnter）',
          condition: '切入本天气时。',
          effect: '双方附加2层中毒。',
        },
      ],
    },
  };

  const mechanicGuideSeed = [
    { term: '中毒', timing: '回合结算后 / 回合推进' },
    { term: '荆棘', timing: '伤害结算前' },
    { term: '力量', timing: '攻击值计算阶段' },
    { term: '韧性', timing: '防守值计算阶段' },
    { term: '反击', timing: '防守值 > 攻击值时' },
    { term: '反击准备', timing: '获得状态后的下一次防守' },
    { term: '洞穿', timing: '攻击伤害结算阶段' },
    { term: '力场', timing: '受击结算阶段（非洞穿伤害）' },
    { term: '连击', timing: '本次攻击结算后追加一段攻击' },
    { term: '瞬伤', timing: '技能或天气即时触发' },
    { term: '命定', timing: '攻击/防守选骰确认时' },
    { term: '超载', timing: '攻击确认与防守确认阶段' },
    { term: '不屈', timing: '受到致命伤害时（本回合）' },
    { term: '背水', timing: '主动发动时立即生效' },
    {
      term: '虹吸',
      timing: '伤害结算后（onAfterDamageResolved）',
      description: '造成伤害后，回复伤害值的50%（向下取整），且不会超过最大生命值。',
    },
  ];

  const WEATHER_SHORT_EFFECT_MAP = {
    frost: '若攻击选骰含同点数，下回合防御等级+1。',
    frog_rain: '所有骰子不会掷出最小值。',
    light_snow: '攻击回合未重投时，下回合获得3层临时韧性。',
    fish_rain: '攻防确认时双方各额外获得1次重投机会。',
    illusion_sun: '额外+2次重投，但每次重投附加2层荆棘。',
    gale: '攻击确认时获得1次连击。',
    sleet: '非满血玩家回合开始时获得反击且防御等级+2。',
    eclipse: '攻击选骰含不同点数时，攻击值+4。',
    thunder_rain: '攻击方攻击值+4，防守方防御值+4。',
    blizzard: '防守值<8时，本回合获得力场。',
    scorching_sun: '造成伤害后，回复伤害值50%（向下取整）。',
    acid_rain: '每回合对当前生命更高方附加1层中毒。',
    high_temp: '每回合生命更低方获得2层力量（阶段内有效）。',
    heavy_rain: '阶段开始双方攻击等级+1、防御等级+1。',
    mid_snow: '攻防选骰含3同点时，回复10点生命。',
    big_snow: '攻防选骰含7时，攻击值/防御值+4。',
    sandstorm: '攻击选骰全奇数时，获得3层力量。',
    cloud_sea: '阶段切换时双方各获得1次曜彩骰次数。',
    rainbow: '攻击值<=10时，本次攻击获得洞穿。',
    drought: '按对方防御等级每级附加3点攻击值。',
    sun_moon: '攻击方生命值<=3时，攻击值翻倍。',
    sunbeam: '生命更低方攻击时获得连击。',
    spacetime_storm: '攻击选骰全6时，伤害后双方生命互换。',
    sunny_rain: '防守方骰子无法掷出最大值。',
    clear: '阶段切换时双方获得5层力量。',
    clear_thunder: '攻击确认时直接造成3点瞬伤。',
    toxic_fog: '阶段切换时双方附加2层中毒。',
  };

  let weatherBroadcastTimer = null;
  let weatherBroadcastHideTimer = null;

  function normalizeGuideTab(tab) {
    return tab === 'mechanic' || tab === 'mechanics' ? 'mechanic' : 'weather';
  }

  function normalizeGuideStage(value) {
    const n = Number.parseInt(value, 10);
    return WEATHER_STAGE_ORDER.includes(n) ? n : WEATHER_STAGE_ORDER[0];
  }

  function getWeatherStageRoundByRound(round) {
    if (round >= 8) return 8;
    if (round >= 6) return 6;
    if (round >= 4) return 4;
    if (round >= 2) return 2;
    return 0;
  }

  function getWeatherDisplay(game) {
    const round = game && Number.isInteger(game.round) ? game.round : 1;
    const weather = game && game.weather ? game.weather : null;
    const stageRound = weather && Number.isInteger(weather.stageRound) && weather.stageRound > 0
      ? weather.stageRound
      : getWeatherStageRoundByRound(round);
    const weatherId = weather && typeof weather.weatherId === 'string' ? weather.weatherId : null;

    if (!weatherId) {
      return {
        id: null,
        name: '无天气',
        type: '-',
        typeClass: 'assist',
        stageRound,
        effect: round <= 1 ? '第1回合天气不生效。' : '本阶段天气缺失，按无天气处理。',
        isNone: true,
      };
    }

    const type = weather.weatherType || '助力';
    return {
      id: weatherId,
      name: weather.weatherName || weatherId,
      type,
      typeClass: WEATHER_TYPE_CLASS[type] || 'assist',
      stageRound,
      effect: WEATHER_SHORT_EFFECT_MAP[weatherId] || '效果待同步，请查看天气与机制。',
      isNone: false,
    };
  }

  function getWeatherBroadcastNode() {
    let node = document.getElementById('weatherBroadcast');
    if (node) return node;

    node = document.createElement('div');
    node.id = 'weatherBroadcast';
    node.className = 'weatherBroadcast hidden';
    document.body.appendChild(node);
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
      ? '天气切换：无天气｜第1回合天气不生效。'
      : `天气切换：${display.name}｜${display.effect}`;

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

  function getMechanicGuideData() {
    return mechanicGuideSeed.map((entry) => ({
      term: entry.term,
      timing: entry.timing,
      description: entry.description || GLOSSARY[entry.term] || '待补充定义。',
    }));
  }

  function buildWeatherGuideSection(activeStage) {
    const stage = normalizeGuideStage(activeStage);
    const cards = weatherGuideData.stages[stage] || [];
    const stageTabsHtml = WEATHER_STAGE_ORDER.map((round) => {
      const count = (weatherGuideData.stages[round] || []).length;
      const activeClass = round === stage ? ' active' : '';
      return `<button type="button" class="guideStageTab${activeClass}" data-guide-stage="${round}">回合${round}（${count}）</button>`;
    }).join('');

    const cardsHtml = cards.map((card) => {
      const typeClass = WEATHER_TYPE_CLASS[card.type] || 'assist';
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
      `    <ul>${weatherGuideData.introRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>`,
      '  </div>',
      `  <div class="guideStageTabs">${stageTabsHtml}</div>`,
      `  <p class="guideStageHint">当前展示：回合${stage}天气候选池，共${cards.length}张。</p>`,
      `  <div class="weatherGuideGrid">${cardsHtml}</div>`,
      '</section>',
    ].join('');
  }

  function buildMechanicGuideSection() {
    const items = getMechanicGuideData();
    const rows = items.map((entry) => [
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
      '    <p>以下术语与战斗页 tooltip 保持同源定义，用于快速理解状态、结算和触发时机。</p>',
      '  </div>',
      `  <div class="mechanicGuideGrid">${rows}</div>`,
      '</section>',
    ].join('');
  }

  function buildGuideModalContent(activeTab, activeStage) {
    const tab = normalizeGuideTab(activeTab);
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
    const activeTab = normalizeGuideTab(overlay.dataset.activeTab);
    const activeStage = normalizeGuideStage(overlay.dataset.activeStage);

    overlay.dataset.activeTab = activeTab;
    overlay.dataset.activeStage = String(activeStage);

    const content = overlay.querySelector('#guideContent');
    if (content) {
      content.innerHTML = buildGuideModalContent(activeTab, activeStage);
    }
  }

  function getGuideOverlay() {
    let overlay = document.getElementById('guideOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'guideOverlay';
    overlay.className = 'docOverlay hidden';
    overlay.dataset.activeTab = 'weather';
    overlay.dataset.activeStage = String(WEATHER_STAGE_ORDER[0]);

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
        overlay.dataset.activeStage = stageBtn.getAttribute('data-guide-stage') || String(WEATHER_STAGE_ORDER[0]);
        renderGuideModal(overlay);
      }
    };

    const onEsc = (event) => {
      if (event.key === 'Escape' && !overlay.classList.contains('hidden')) {
        closeGuideModal();
      }
    };
    document.addEventListener('keydown', onEsc);

    document.body.appendChild(overlay);
    return overlay;
  }

  function showGuideModal(defaultTab) {
    const overlay = getGuideOverlay();
    overlay.dataset.activeTab = normalizeGuideTab(defaultTab || overlay.dataset.activeTab);
    overlay.dataset.activeStage = String(normalizeGuideStage(overlay.dataset.activeStage));
    renderGuideModal(overlay);
    overlay.classList.remove('hidden');
  }

  function getBaseCharacterList() {
    return Object.keys(state.characters)
      .map((id) => state.characters[id])
      .filter((c) => !c.isCustomVariant)
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
    for (const p of parts) {
      if (!/^-?\d+$/.test(p)) return null;
      const n = Number(p);
      if (!Number.isInteger(n) || n < 2) return null;
      values.push(n);
    }
    return values;
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
    intro.textContent = '继承母角色机制，只调整数值面板（HP、骰子、攻防等级、曜彩次数、攻击重投上限）。';

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

      if (!idInput.value.trim()) {
        idInput.value = suggestVariantId(base.id);
      }
      if (!nameInput.value.trim()) {
        nameInput.value = `${base.name} 变体`;
      }
    };

    baseSelect.onchange = () => {
      idInput.value = '';
      nameInput.value = '';
      fillByBase();
    };

    form.onsubmit = (event) => {
      event.preventDefault();

      const base = state.characters[baseSelect.value];
      if (!base) {
        showErrorToast('母角色无效，请重新选择。');
        return;
      }

      const variantId = String(idInput.value || '').trim();
      if (!/^[a-z0-9_]{3,40}$/.test(variantId)) {
        showErrorToast('角色 ID 需要 3-40 位小写字母/数字/下划线。');
        return;
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

      if (!Object.keys(overrides).length) {
        showErrorToast('请至少修改一项数值后再保存。');
        return;
      }

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
      const op = document.createElement('option');
      op.value = c.id;
      op.textContent = `${c.name} (${c.id})`;
      baseSelect.appendChild(op);
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

  function sanitizeDisplayName(name) {
    return String(name || '').replace(/[\[\]【】]/g, '').trim();
  }

  function charTooltipHtml(characterId, characterName) {
    const c = state.characters[characterId];
    if (!c) return escapeHtml(sanitizeDisplayName(characterName));
    return '<span class="glossTip">' + escapeHtml(sanitizeDisplayName(c.name))
      + '<span class="glossTipText">'
      + escapeHtml('HP ' + c.hp + ' | ' + c.shortSpec)
      + '<br>' + escapeHtml('技能：' + c.skillText)
      + '</span></span>';
  }

  function auroraTooltipHtml(auroraDiceId, auroraDiceName) {
    if (!auroraDiceId || !auroraDiceName) return escapeHtml(sanitizeDisplayName(auroraDiceName || '无'));
    const a = state.auroraDice.find((d) => d.id === auroraDiceId);
    if (!a) return escapeHtml(sanitizeDisplayName(auroraDiceName));
    return '<span class="glossTip">' + escapeHtml(sanitizeDisplayName(a.name))
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
    showGuideModal,
    getWeatherDisplay,
    showWeatherBroadcast,
    showCustomCharacterModal,
    wrapGlossaryTerms,
    charTooltipHtml,
    auroraTooltipHtml,
  });
})();
