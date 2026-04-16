const DEFAULT_DIFFICULTY = 'hard';
const DEFAULT_MODEL_SCALE = 180;
const VALUE_MODEL_VERSION = 2;

const AI_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    id: 'easy',
    candidateLimitAttack: 3,
    candidateLimitDefense: 3,
    searchSamplesAttack: 0,
    searchSamplesDefense: 0,
    maxDecisionMs: 8,
    replyTopK: 1,
    weatherLookahead: false,
    riskProfile: 'none',
    useValueModel: false,
    useTacticalOverrides: false,
    modelScale: DEFAULT_MODEL_SCALE,
  }),
  normal: Object.freeze({
    id: 'normal',
    candidateLimitAttack: 4,
    candidateLimitDefense: 4,
    searchSamplesAttack: 12,
    searchSamplesDefense: 10,
    maxDecisionMs: 16,
    replyTopK: 1,
    weatherLookahead: false,
    riskProfile: 'steady',
    useValueModel: false,
    useTacticalOverrides: true,
    modelScale: DEFAULT_MODEL_SCALE,
  }),
  hard: Object.freeze({
    id: 'hard',
    candidateLimitAttack: 5,
    candidateLimitDefense: 4,
    searchSamplesAttack: 28,
    searchSamplesDefense: 22,
    maxDecisionMs: 24,
    replyTopK: 1,
    weatherLookahead: false,
    riskProfile: 'steady',
    useValueModel: false,
    useTacticalOverrides: true,
    modelScale: DEFAULT_MODEL_SCALE,
  }),
  elite: Object.freeze({
    id: 'elite',
    candidateLimitAttack: 6,
    candidateLimitDefense: 5,
    searchSamplesAttack: 96,
    searchSamplesDefense: 72,
    maxDecisionMs: 120,
    replyTopK: 2,
    weatherLookahead: true,
    riskProfile: 'calculated',
    useValueModel: true,
    useTacticalOverrides: true,
    modelScale: DEFAULT_MODEL_SCALE,
  }),
});

const RESTRICTED_AI_LOADOUTS = Object.freeze([
  Object.freeze({ characterId: 'baie', auroraDiceId: 'legacy' }),
  Object.freeze({ characterId: 'daheita', auroraDiceId: 'destiny' }),
  Object.freeze({ characterId: 'daheita', auroraDiceId: 'berserker' }),
  Object.freeze({ characterId: 'fengjin', auroraDiceId: 'oath' }),
  Object.freeze({ characterId: 'fengjin', auroraDiceId: 'sixsix' }),
  Object.freeze({ characterId: 'huangquan', auroraDiceId: 'repeater' }),
  Object.freeze({ characterId: 'huohua', auroraDiceId: 'trickster' }),
  Object.freeze({ characterId: 'huohua', auroraDiceId: 'destiny' }),
  Object.freeze({ characterId: 'sanyueqi', auroraDiceId: 'oath' }),
  Object.freeze({ characterId: 'sanyueqi', auroraDiceId: 'magicbullet' }),
  Object.freeze({ characterId: 'xilian', auroraDiceId: 'legacy' }),
  Object.freeze({ characterId: 'xilian', auroraDiceId: 'oath' }),
  Object.freeze({ characterId: 'xiadie', auroraDiceId: 'legacy' }),
  Object.freeze({ characterId: 'yaoguang', auroraDiceId: 'destiny' }),
  Object.freeze({ characterId: 'zhigengniao', auroraDiceId: null }),
]);

function getDifficultyConfig(id) {
  if (typeof id === 'string' && AI_DIFFICULTIES[id]) return AI_DIFFICULTIES[id];
  return AI_DIFFICULTIES[DEFAULT_DIFFICULTY];
}

module.exports = {
  AI_DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  DEFAULT_MODEL_SCALE,
  VALUE_MODEL_VERSION,
  RESTRICTED_AI_LOADOUTS,
  getDifficultyConfig,
};
