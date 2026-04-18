(function initProtocolVersioning(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPProtocolVersioning = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildProtocolVersioning() {
  const PROTOCOL_VERSION = '2';
  const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(['2']);
  const DEPRECATED_PROTOCOL_VERSIONS = Object.freeze(['1']);

  function isSupportedProtocolVersion(version) {
    return typeof version === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(version.trim());
  }

  function isDeprecatedProtocolVersion(version) {
    return typeof version === 'string' && DEPRECATED_PROTOCOL_VERSIONS.includes(version.trim());
  }

  return Object.freeze({
    PROTOCOL_VERSION,
    SUPPORTED_PROTOCOL_VERSIONS,
    DEPRECATED_PROTOCOL_VERSIONS,
    isSupportedProtocolVersion,
    isDeprecatedProtocolVersion,
  });
});
