(function() {
  const WEATHER_STAGE_ORDER = Object.freeze([2, 4, 6, 8]);
  const WEATHER_TYPE_CLASS = Object.freeze({
    坚守: 'guard',
    助力: 'assist',
    进攻: 'offense',
    逆转: 'reverse',
  });

  const WEATHER_SHORT_EFFECT_MAP = Object.freeze({
    frost: '攻击选骰出现重复点数时，下回合防御等级+1。',
    frog_rain: '本阶段内掷出的骰子不会出现最小值。',
    light_snow: '攻击方本回合未重掷时，下回合获得韧性。',
    fish_rain: '攻防确认后，双方额外+1次重掷。',
    illusion_sun: '攻击重掷会附带超载叠层。',
    gale: '攻击确认后追加一次同伤害连击。',
    sleet: '每回合开始时，血量较低一方获得护盾/韧性补偿。',
    eclipse: '攻击选骰不全相同时，攻击值+4。',
    thunder_rain: '攻防确认时，攻击值/防御值额外+4。',
    blizzard: '防御值较低时获得力场。',
    scorching_sun: '造成伤害后按比例回复生命。',
    acid_rain: '每回合开始时给高血量一方附加中毒。',
    high_temp: '每回合开始时给低血量一方增加力量。',
    heavy_rain: '阶段天气切换时，双方攻防等级同步+1。',
    mid_snow: '选骰出现三同点时回复生命。',
    big_snow: '选中包含7点时额外提升攻/防值。',
    sandstorm: '攻击选骰全为奇数时，获得力量。',
    cloud_sea: '阶段切换时双方曜彩次数+1。',
    rainbow: '攻击值较低时，本次攻击获得洞穿。',
    drought: '攻击值按对手防御等级获得额外加成。',
    sun_moon: '攻击方血量<=3时，攻击值翻倍。',
    sunbeam: '弱势方攻击时获得额外连击。',
    spacetime_storm: '结算后满足条件时交换双方生命值。',
    sunny_rain: '防守方掷骰受限，防守风险提高。',
    clear: '阶段切换时双方都增加力量。',
    clear_thunder: '攻击确认后追加瞬时伤害。',
    toxic_fog: '阶段切换时双方都叠加中毒。',
  });

  const WEATHER_CONDITION_MAP = Object.freeze({
    frost: '攻击方确认攻击时，所选骰子存在任意重复点数。',
    frog_rain: '阶段内任意掷骰/重掷时生效。',
    light_snow: '攻击方本回合一次攻击都没有执行重掷。',
    fish_rain: '每次攻击确认与防御确认完成后。',
    illusion_sun: '攻击方执行重掷动作时。',
    gale: '攻击方完成攻击确认后。',
    sleet: '每回合开始结算天气时。',
    eclipse: '攻击方确认攻击时，所选骰子不是全相同点数。',
    thunder_rain: '攻击确认和防御确认两个节点都会触发。',
    blizzard: '防御结算后，防守方防御值低于阈值。',
    scorching_sun: '攻击方本回合造成了有效伤害后。',
    acid_rain: '每回合开始时，对当前血量更高的一方。',
    high_temp: '每回合开始时，对当前血量更低的一方。',
    heavy_rain: '天气在第2/4/6/8回合切换进入该天气时。',
    mid_snow: '攻方或守方确认选骰时，所选点数组成三同。',
    big_snow: '确认选骰时，所选中包含点数7。',
    sandstorm: '攻击方确认攻击时，所选骰子全部为奇数。',
    cloud_sea: '天气阶段切换进入该天气时。',
    rainbow: '攻击确认后，本次攻击值低于触发阈值。',
    drought: '攻击确认时，按防守方当前防御等级计算加成。',
    sun_moon: '攻击确认时，攻击方当前血量<=3。',
    sunbeam: '每回合开局，弱势方作为攻击方行动时。',
    spacetime_storm: '伤害结算结束后，满足生命交换条件时。',
    sunny_rain: '防守方执行掷骰动作时。',
    clear: '天气阶段切换进入该天气时。',
    clear_thunder: '攻击确认完成并进入伤害结算时。',
    toxic_fog: '天气阶段切换进入该天气时。',
  });

  const MECHANIC_GUIDE = Object.freeze([
    { term: '命定', timing: '选骰确认阶段', description: '命定骰必须被选中。' },
    { term: '重掷', timing: '攻击选骰阶段', description: '可重掷已选中的骰子，消耗重掷次数。' },
    { term: '曜彩骰', timing: '攻防选骰阶段', description: '可额外加入特殊骰并触发对应效果。' },
    { term: '力场', timing: '受伤前', description: '抵消一次非洞穿伤害。' },
    { term: '洞穿', timing: '伤害结算', description: '无视防御值与力场直接造成伤害。' },
    { term: '反击', timing: '防御值高于攻击值时', description: '按差值对攻击方造成反伤。' },
  ]);

  function normalizeGuideTab(tab) {
    return (tab === 'mechanic' || tab === 'mechanics') ? 'mechanic' : 'weather';
  }

  function normalizeGuideStage(stage) {
    const numeric = Number.parseInt(stage, 10);
    return WEATHER_STAGE_ORDER.includes(numeric) ? numeric : WEATHER_STAGE_ORDER[0];
  }

  function getWeatherStageRoundByRound(round) {
    if (round >= 8) return 8;
    if (round >= 6) return 6;
    if (round >= 4) return 4;
    if (round >= 2) return 2;
    return 0;
  }

  function buildWeatherGuideData(weatherCatalog) {
    const catalog = weatherCatalog || {};
    const poolsByStage = catalog.poolsByStage || {};
    const introRules = [
      '第 2/4/6/8 回合开始前会切换天气。',
      '每个阶段会从对应候选池中随机生效 1 个天气。',
      '天气结算以战斗日志与最终数值为准。',
    ];
    const stages = {};
    for (const stage of WEATHER_STAGE_ORDER) {
      const rows = Array.isArray(poolsByStage[stage]) ? poolsByStage[stage] : [];
      stages[stage] = rows.map((item) => ({
        id: item.id,
        name: item.name || item.id,
        type: item.type || '助力',
        timing: '满足触发节点时立即结算',
        condition: WEATHER_CONDITION_MAP[item.id] || '见战斗日志中的天气触发条件。',
        effect: WEATHER_SHORT_EFFECT_MAP[item.id] || '见战斗日志中的具体结算。',
      }));
    }
    return { introRules, stages };
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
        effect: round <= 1 ? '第1回合天气不生效。' : '当前阶段无有效天气效果。',
        isNone: true,
      };
    }

    const weatherType = weather.weatherType || '助力';
    return {
      id: weatherId,
      name: weather.weatherName || weatherId,
      type: weatherType,
      typeClass: WEATHER_TYPE_CLASS[weatherType] || 'assist',
      stageRound,
      effect: WEATHER_SHORT_EFFECT_MAP[weatherId] || '效果以战斗日志与结算为准。',
      condition: WEATHER_CONDITION_MAP[weatherId] || '触发条件见日志。',
      isNone: false,
    };
  }

  window.GPPGuideData = {
    WEATHER_STAGE_ORDER,
    WEATHER_TYPE_CLASS,
    WEATHER_SHORT_EFFECT_MAP,
    WEATHER_CONDITION_MAP,
    MECHANIC_GUIDE,
    normalizeGuideTab,
    normalizeGuideStage,
    getWeatherStageRoundByRound,
    buildWeatherGuideData,
    getWeatherDisplay,
  };
})();
