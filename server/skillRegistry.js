const skillMap = new Map();

function register(skillId, handlers, meta = {}) {
  if (!skillId || typeof skillId !== 'string') return;
  const safeHandlers = handlers && typeof handlers === 'object' ? handlers : {};
  skillMap.set(skillId, { handlers: safeHandlers, meta });
}

function unregister(skillId) {
  skillMap.delete(skillId);
}

function clear() {
  skillMap.clear();
}

function get(skillId) {
  return skillMap.get(skillId) || null;
}

function run(skillId, trigger, context) {
  const entry = skillMap.get(skillId);
  if (!entry) return null;
  const fn = entry.handlers && entry.handlers[trigger];
  if (typeof fn !== 'function') return null;
  try {
    return fn(context || {});
  } catch (err) {
    const triggerText = trigger || '(unknown)';
    console.error(`[SkillRegistry] ${skillId}.${triggerText} failed:`, err && err.stack ? err.stack : err);
    return null;
  }
}

function runMany(skillRefs, trigger, context) {
  if (!Array.isArray(skillRefs) || !skillRefs.length) return null;
  let last = null;
  for (const ref of skillRefs) {
    const skillId = typeof ref === 'string' ? ref : ref && ref.skillId;
    if (!skillId) continue;
    const params = ref && typeof ref === 'object' ? ref.params : undefined;
    const result = run(skillId, trigger, Object.assign({}, context, { skillParams: params || {} }));
    if (result !== null && result !== undefined) last = result;
  }
  return last;
}

module.exports = {
  register,
  unregister,
  clear,
  get,
  run,
  runMany,
};
