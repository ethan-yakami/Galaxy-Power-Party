(function initConnectionMessageRouter(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPConnectionMessageRouter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildConnectionMessageRouter() {
  function createMessageRouter(handlers, options) {
    const routeTable = handlers && typeof handlers === 'object' ? handlers : {};
    const opts = options && typeof options === 'object' ? options : {};
    const onUnknown = typeof opts.onUnknown === 'function' ? opts.onUnknown : null;

    return function routeMessage(message, context) {
      if (!message || typeof message !== 'object') {
        return false;
      }
      const type = typeof message.type === 'string' ? message.type : '';
      const handler = type ? routeTable[type] : null;
      if (typeof handler === 'function') {
        return handler(message, context) !== false;
      }
      if (onUnknown) {
        return onUnknown(message, context) !== false;
      }
      return false;
    };
  }

  return Object.freeze({
    createMessageRouter,
  });
});
