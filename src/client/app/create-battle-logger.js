/**
 * @param {{ scope: string }} options
 */
export function createBattleLogger(options) {
  const diagnostics = [];
  const scope = options.scope;

  /**
   * @param {'debug' | 'info' | 'warn' | 'error'} level
   * @param {string} event
   * @param {Record<string, unknown>=} context
   */
  function emit(level, event, context = {}) {
    const entry = {
      level,
      event,
      scope,
      context,
      timestamp: Date.now(),
    };
    diagnostics.push(entry);
    if (diagnostics.length > 200) {
      diagnostics.shift();
    }

    const method = level === 'error'
      ? 'error'
      : level === 'warn'
        ? 'warn'
        : level === 'debug'
          ? 'debug'
          : 'info';
    console[method](`[${scope}] ${event}`, context);
  }

  return {
    diagnostics,
    debug(event, context) {
      emit('debug', event, context);
    },
    info(event, context) {
      emit('info', event, context);
    },
    warn(event, context) {
      emit('warn', event, context);
    },
    error(event, context) {
      emit('error', event, context);
    },
  };
}
