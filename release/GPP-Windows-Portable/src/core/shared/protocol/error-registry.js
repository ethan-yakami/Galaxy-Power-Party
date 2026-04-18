(function initProtocolErrorRegistry(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPProtocolErrors = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildProtocolErrorRegistry() {
  const ERROR_REGISTRY = Object.freeze({
    INVALID_JSON: {
      code: 'INVALID_JSON',
      category: 'protocol',
      severity: 'warn',
      defaultMessage: '消息格式无效。',
    },
    INVALID_PAYLOAD: {
      code: 'INVALID_PAYLOAD',
      category: 'protocol',
      severity: 'warn',
      defaultMessage: '消息载荷无效。',
    },
    UNKNOWN_TYPE: {
      code: 'UNKNOWN_TYPE',
      category: 'protocol',
      severity: 'warn',
      defaultMessage: '未知的消息类型。',
    },
    ROOM_NOT_FOUND: {
      code: 'ROOM_NOT_FOUND',
      category: 'user',
      severity: 'warn',
      defaultMessage: '房间不存在，可能已失效或离线保留时间已结束。',
    },
    ROOM_RESERVED: {
      code: 'ROOM_RESERVED',
      category: 'user',
      severity: 'warn',
      defaultMessage: '房主或玩家正在重连，请稍后再试。',
    },
    ROOM_FULL: {
      code: 'ROOM_FULL',
      category: 'user',
      severity: 'warn',
      defaultMessage: '房间已满，请换个房间或稍后再试。',
    },
    ROOM_IN_GAME: {
      code: 'ROOM_IN_GAME',
      category: 'user',
      severity: 'warn',
      defaultMessage: '房间已经开打，当前无法加入。',
    },
    ROOM_ENDED: {
      code: 'ROOM_ENDED',
      category: 'user',
      severity: 'warn',
      defaultMessage: '房间已结束，请重新创建或加入其他房间。',
    },
    NOT_IN_ROOM: {
      code: 'NOT_IN_ROOM',
      category: 'user',
      severity: 'warn',
      defaultMessage: '你当前不在房间内。',
    },
    NOT_YOUR_TURN: {
      code: 'NOT_YOUR_TURN',
      category: 'user',
      severity: 'warn',
      defaultMessage: '现在还没有轮到你。',
    },
    INVALID_SELECTION: {
      code: 'INVALID_SELECTION',
      category: 'user',
      severity: 'warn',
      defaultMessage: '当前选择无效。',
    },
    BATTLE_NOT_ACTOR: {
      code: 'BATTLE_NOT_ACTOR',
      category: 'battle',
      severity: 'warn',
      defaultMessage: '只有当前行动方可以提交这个战斗操作。',
    },
    BATTLE_STALE_TURN: {
      code: 'BATTLE_STALE_TURN',
      category: 'battle',
      severity: 'warn',
      defaultMessage: '提交的 turnId 已经过期。',
    },
    BATTLE_INVALID_ACTION: {
      code: 'BATTLE_INVALID_ACTION',
      category: 'battle',
      severity: 'warn',
      defaultMessage: '提交的 actionId 对当前回合无效。',
    },
    BATTLE_ACTION_CONSUMED: {
      code: 'BATTLE_ACTION_CONSUMED',
      category: 'battle',
      severity: 'warn',
      defaultMessage: '这个战斗操作回合已经被消耗。',
    },
    BATTLE_PROTOCOL_DEPRECATED: {
      code: 'BATTLE_PROTOCOL_DEPRECATED',
      category: 'protocol',
      severity: 'warn',
      defaultMessage: '旧版战斗协议已废弃，请提交 action ticket。',
    },
    SESSION_RESUME_FAILED: {
      code: 'SESSION_RESUME_FAILED',
      category: 'resume',
      severity: 'warn',
      defaultMessage: '会话恢复失败。',
    },
    RATE_LIMITED: {
      code: 'RATE_LIMITED',
      category: 'security',
      severity: 'warn',
      defaultMessage: '请求过于频繁，请稍后再试。',
    },
    UNSUPPORTED_PROTOCOL_VERSION: {
      code: 'UNSUPPORTED_PROTOCOL_VERSION',
      category: 'protocol',
      severity: 'error',
      defaultMessage: '协议版本不受支持。',
    },
    INTERNAL_ERROR: {
      code: 'INTERNAL_ERROR',
      category: 'internal',
      severity: 'error',
      defaultMessage: '服务器内部错误。',
    },
  });

  function getErrorDescriptor(code) {
    if (typeof code === 'string' && ERROR_REGISTRY[code]) {
      return ERROR_REGISTRY[code];
    }
    return ERROR_REGISTRY.INTERNAL_ERROR;
  }

  return Object.freeze({
    ERROR_REGISTRY,
    getErrorDescriptor,
    listErrorDescriptors() {
      return Object.values(ERROR_REGISTRY);
    },
  });
});
