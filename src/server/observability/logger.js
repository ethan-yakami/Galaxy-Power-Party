function safeSerialize(context) {
  if (context === undefined) return '';
  try {
    return ` ${JSON.stringify(context)}`;
  } catch {
    return ' [unserializable-context]';
  }
}

function createLogger(scope) {
  function write(level, event, context) {
    const line = `[${level.toUpperCase()}][${scope}] ${event}${safeSerialize(context)}`;
    if (level === 'error') {
      console.error(line);
      return;
    }
    if (level === 'warn') {
      console.warn(line);
      return;
    }
    if (level === 'debug') {
      console.debug(line);
      return;
    }
    console.info(line);
  }

  return Object.freeze({
    debug(event, context) {
      write('debug', event, context);
    },
    info(event, context) {
      write('info', event, context);
    },
    warn(event, context) {
      write('warn', event, context);
    },
    error(event, context) {
      write('error', event, context);
    },
  });
}

module.exports = {
  createLogger,
};
