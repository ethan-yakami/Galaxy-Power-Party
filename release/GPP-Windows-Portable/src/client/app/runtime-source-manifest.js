const RUNTIME_SOURCE_FILES = Object.freeze([
  { src: 'js/url-utils.js', file: 'src/client/js/url-utils.js' },
  { src: 'js/preset-schema.js', file: 'src/client/js/preset-schema.js' },
  { src: 'js/auth.js', file: 'src/client/js/auth.js' },
  { src: 'js/launcher.js', file: 'src/client/js/launcher.js' },
  { src: 'shared/replay-schema.js', file: 'src/core/shared/replay-schema.js' },
  { src: 'shared/preset-schema.js', file: 'src/core/shared/preset-schema.js' },
  { src: 'shared/protocol/error-registry.js', file: 'src/core/shared/protocol/error-registry.js' },
  { src: 'shared/protocol/versioning.js', file: 'src/core/shared/protocol/versioning.js' },
  { src: 'js/replay-history.js', file: 'src/client/js/replay-history.js' },
  { src: 'js/connection-state-machine.js', file: 'src/client/js/connection-state-machine.js' },
  { src: 'js/connection-launch-flow.js', file: 'src/client/js/connection-launch-flow.js' },
  { src: 'js/connection-message-router.js', file: 'src/client/js/connection-message-router.js' },
  { src: 'js/battle-view-model.js', file: 'src/client/js/battle-view-model.js' },
  { src: 'js/state-selectors.js', file: 'src/client/js/state-selectors.js' },
  { src: 'js/battle-action-map.js', file: 'src/client/js/battle-action-map.js' },
  { src: 'js/guide-data.js', file: 'src/client/js/guide-data.js' },
  { src: 'js/ui-glossary.js', file: 'src/client/js/ui-glossary.js' },
  { src: 'js/ui-modal-controller.js', file: 'src/client/js/ui-modal-controller.js' },
  { src: 'js/ui.js', file: 'src/client/js/ui.js' },
  { src: 'js/effects.js', file: 'src/client/js/effects.js' },
  { src: 'js/dice-ui.js', file: 'src/client/js/dice-ui.js' },
  { src: 'js/render.js', file: 'src/client/js/render.js' },
  { src: 'js/connection.js', file: 'src/client/js/connection.js' },
  { src: 'js/replays.js', file: 'src/client/js/replays.js' },
  { src: 'js/replays-cloud.js', file: 'src/client/js/replays-cloud.js' },
  { src: 'js/workshop.js', file: 'src/client/js/workshop.js' },
]);

const manifestBySrc = new Map(RUNTIME_SOURCE_FILES.map((entry) => [entry.src, entry]));

export const LAUNCHER_RUNTIME_SCRIPTS = Object.freeze([
  'js/url-utils.js',
  'js/preset-schema.js',
  'js/auth.js',
  'js/launcher.js',
]);

export const BATTLE_RUNTIME_CRITICAL_SCRIPTS = Object.freeze([
  'shared/replay-schema.js',
  'shared/preset-schema.js',
  'shared/protocol/error-registry.js',
  'shared/protocol/versioning.js',
  'js/url-utils.js',
  'js/auth.js',
  'js/connection-state-machine.js',
  'js/connection-launch-flow.js',
  'js/connection-message-router.js',
  'js/battle-view-model.js',
  'js/state-selectors.js',
  'js/battle-action-map.js',
  'js/ui.js',
  'js/effects.js',
  'js/dice-ui.js',
  'js/render.js',
  'js/connection.js',
]);

export const BATTLE_RUNTIME_DEFERRED_SOURCE_SETS = Object.freeze({
  replay: Object.freeze([
    'js/replay-history.js',
  ]),
  ui: Object.freeze([
    'js/guide-data.js',
    'js/ui-glossary.js',
    'js/ui-modal-controller.js',
  ]),
});

export const BATTLE_RUNTIME_SCRIPTS = Object.freeze([
  ...BATTLE_RUNTIME_CRITICAL_SCRIPTS,
  ...BATTLE_RUNTIME_DEFERRED_SOURCE_SETS.replay,
  ...BATTLE_RUNTIME_DEFERRED_SOURCE_SETS.ui,
]);

export const REPLAYS_RUNTIME_SCRIPTS = Object.freeze([
  'js/url-utils.js',
  'shared/replay-schema.js',
  'js/auth.js',
  'js/replay-history.js',
  'js/replays.js',
  'js/replays-cloud.js',
]);

export const WORKSHOP_RUNTIME_SCRIPTS = Object.freeze([
  'js/url-utils.js',
  'js/workshop.js',
]);

export function listRuntimeSourceFiles() {
  return RUNTIME_SOURCE_FILES.slice();
}

export function getRuntimeSourceFilesFor(paths) {
  return paths.map((src) => {
    const entry = manifestBySrc.get(src);
    if (!entry) {
      throw new Error(`Unknown runtime source manifest entry: ${src}`);
    }
    return entry;
  });
}
