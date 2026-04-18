/**
 * @param {any} windowRef
 * @param {string} url
 * @param {string} code
 */
export function evalLegacySource(windowRef, url, code) {
  windowRef.eval(`${String(code || '')}\n//# sourceURL=${url}`);
}
