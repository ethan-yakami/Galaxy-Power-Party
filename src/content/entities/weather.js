const STAGE_ROUNDS = [2, 4, 6, 8];

const WEATHER_POOLS = {
  2: ['frost', 'frog_rain', 'light_snow', 'fish_rain', 'illusion_sun', 'gale', 'sleet', 'eclipse', 'thunder_rain'],
  4: ['blizzard', 'scorching_sun', 'acid_rain', 'high_temp', 'heavy_rain', 'mid_snow', 'big_snow', 'sandstorm'],
  6: ['cloud_sea', 'rainbow', 'drought', 'sun_moon', 'sunbeam', 'spacetime_storm', 'sunny_rain'],
  8: ['clear', 'clear_thunder', 'toxic_fog'],
};

const WEATHER_DEFS = {
  frost: { id: 'frost', name: '霜冻', type: '坚守' },
  frog_rain: { id: 'frog_rain', name: '青蛙雨', type: '助力' },
  light_snow: { id: 'light_snow', name: '小雪', type: '坚守' },
  fish_rain: { id: 'fish_rain', name: '鱼雨', type: '助力' },
  illusion_sun: { id: 'illusion_sun', name: '幻日', type: '进攻' },
  gale: { id: 'gale', name: '狂风', type: '进攻' },
  sleet: { id: 'sleet', name: '雨夹雪', type: '助力' },
  eclipse: { id: 'eclipse', name: '日蚀', type: '进攻' },
  thunder_rain: { id: 'thunder_rain', name: '雷雨', type: '助力' },
  blizzard: { id: 'blizzard', name: '暴雪', type: '坚守' },
  scorching_sun: { id: 'scorching_sun', name: '烈日', type: '进攻' },
  acid_rain: { id: 'acid_rain', name: '酸雨', type: '助力' },
  high_temp: { id: 'high_temp', name: '高温', type: '进攻' },
  heavy_rain: { id: 'heavy_rain', name: '暴雨', type: '逆转' },
  mid_snow: { id: 'mid_snow', name: '中雪', type: '坚守' },
  big_snow: { id: 'big_snow', name: '大雪', type: '坚守' },
  sandstorm: { id: 'sandstorm', name: '沙尘暴', type: '进攻' },
  cloud_sea: { id: 'cloud_sea', name: '云海', type: '助力' },
  rainbow: { id: 'rainbow', name: '彩虹', type: '进攻' },
  drought: { id: 'drought', name: '干旱', type: '进攻' },
  sun_moon: { id: 'sun_moon', name: '日月同辉', type: '逆转' },
  sunbeam: { id: 'sunbeam', name: '光束', type: '进攻' },
  spacetime_storm: { id: 'spacetime_storm', name: '时空风暴', type: '逆转' },
  sunny_rain: { id: 'sunny_rain', name: '晴雨', type: '进攻' },
  clear: { id: 'clear', name: '晴空', type: '进攻' },
  clear_thunder: { id: 'clear_thunder', name: '晴雷', type: '逆转' },
  toxic_fog: { id: 'toxic_fog', name: '毒雾', type: '逆转' },
};

module.exports = {
  STAGE_ROUNDS,
  WEATHER_POOLS,
  WEATHER_DEFS,
};
