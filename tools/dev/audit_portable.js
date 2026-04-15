const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORTABLE_ROOT = path.join(ROOT, 'release', 'GPP-Windows-Portable');

function assertExists(relativePath, failures) {
  const fullPath = path.join(PORTABLE_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Missing: ${relativePath}`);
  }
}

function readJson(relativePath, failures) {
  const fullPath = path.join(PORTABLE_ROOT, relativePath);
  try {
    const raw = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch (error) {
    failures.push(`Invalid JSON: ${relativePath} (${error.message})`);
    return null;
  }
}

function listRelativeFiles(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  const stack = [baseDir];
  const files = [];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) files.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return files.sort();
}

function comparePortableFile(relativePath, failures) {
  const sourcePath = path.join(ROOT, relativePath);
  const portablePath = path.join(PORTABLE_ROOT, relativePath);
  if (!fs.existsSync(sourcePath)) {
    failures.push(`Source missing: ${relativePath}`);
    return;
  }
  if (!fs.existsSync(portablePath)) {
    failures.push(`Portable file missing: ${relativePath}`);
    return;
  }

  const sourceContent = fs.readFileSync(sourcePath, 'utf8');
  const portableContent = fs.readFileSync(portablePath, 'utf8');
  if (sourceContent !== portableContent) {
    failures.push(`Portable file drift: ${relativePath}`);
  }
}

function main() {
  const failures = [];

  if (!fs.existsSync(PORTABLE_ROOT)) {
    console.error('Portable package not found. Run `npm run build:portable` first.');
    process.exit(1);
  }

  [
    'src',
    'src/client',
    'src/client/js/battle-view-model.js',
    'src/server',
    'src/core/shared',
    'src/content/entities',
    'public/portraits',
    'picture',
    'server',
    'scripts',
    'tools/test',
    'docs',
    'runtime/node/node.exe',
    'server.js',
    'package.json',
    'start_game.bat',
    'start_dev.bat',
    'stop_game.bat',
  ].forEach((relativePath) => assertExists(relativePath, failures));

  const packageJson = readJson('package.json', failures);
  if (packageJson && packageJson.scripts) {
    const expectedScripts = {
      start: 'node server.js',
      'audit:paths': 'node tools/dev/audit_paths.js',
      'audit:portable': 'node tools/dev/audit_portable.js',
      test: 'npm run test:battle-engine && npm run test:protocol && npm run test:connection-fsm && npm run test:replay-history && npm run test:battle-view-model && npm run test:ai-runtime',
      'test:battle-engine': 'node tools/test/test_battle_engine.js',
      'test:protocol': 'node tools/test/test_protocol.js',
      'test:connection-fsm': 'node tools/test/test_connection_state_machine.js',
      'test:replay-history': 'node tools/test/test_replay_history.js',
      'test:battle-view-model': 'node tools/test/test_battle_view_model.js',
      'test:ai-runtime': 'node tools/test/test_ai_battle_runtime.js',
    };
    for (const [scriptName, expectedValue] of Object.entries(expectedScripts)) {
      if (packageJson.scripts[scriptName] !== expectedValue) {
        failures.push(`package.json script mismatch: ${scriptName}`);
      }
    }
  }

  const publicFiles = listRelativeFiles(path.join(PORTABLE_ROOT, 'public'));
  const stalePublicFiles = publicFiles.filter((file) => (
    file.endsWith('.html') || file.endsWith('.css') || file.startsWith('js/')
  ));
  for (const file of stalePublicFiles) {
    failures.push(`Portable package contains stale public runtime file: public/${file}`);
  }

  [
    'src/client/battle.html',
    'src/client/js/render.js',
    'src/client/js/connection.js',
    'src/client/js/connection-state-machine.js',
    'src/client/js/battle-view-model.js',
    'src/client/js/dice-ui.js',
    'src/client/js/ui.js',
    'src/client/js/state.js',
  ].forEach((relativePath) => comparePortableFile(relativePath, failures));

  if (failures.length) {
    console.error('[Portable Audit] FAIL');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log('[Portable Audit] PASS');
}

main();
