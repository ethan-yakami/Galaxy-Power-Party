const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function rel(target) {
  return path.relative(ROOT, target).replace(/\\/g, '/');
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  out.sort();
  return out;
}

function getRelativeFileSet(dir) {
  const base = path.resolve(dir);
  return new Set(
    listFiles(base).map((filePath) => path.relative(base, filePath).replace(/\\/g, '/')),
  );
}

function printSection(title, lines) {
  console.log(`\n[${title}]`);
  if (!lines.length) {
    console.log('(none)');
    return;
  }
  for (const line of lines) console.log(line);
}

function collectLegacyToolPathReferences() {
  const findings = [];
  const scanRoots = [
    path.join(ROOT, 'tools'),
    path.join(ROOT, 'scripts'),
  ];
  const patterns = [
    /(?:readFileSync|writeFileSync|existsSync|transformCSS|fixCSS|Get-ChildItem)\([^\n]*['"`](?:\.\/)?public[\\/](?!portraits[\\/])[^'"`]+['"`]/,
    /(?:readFileSync|writeFileSync|existsSync|Get-ChildItem)\([^\n]*['"`](?:\.\/)?server[\\/]entities[\\/][^'"`]+['"`]/,
    /['"`](?:\.\/)?scripts[\\/]test_(?:battle_engine|protocol|connection_state_machine|replay_history)\.js['"`]/,
  ];
  for (const scanRoot of scanRoots) {
    for (const filePath of listFiles(scanRoot)) {
      const relativePath = rel(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (patterns.some((pattern) => pattern.test(line))) {
          findings.push(`${relativePath}:${index + 1}: ${line.trim()}`);
        }
      }
    }
  }
  return findings;
}

function collectPortableBattleRuntimeDrift() {
  const findings = [];
  const portableRoot = path.join(ROOT, 'release', 'GPP-Windows-Portable');
  if (!fs.existsSync(portableRoot)) return findings;

  const syncTargets = [
    'src/client/battle.html',
    'src/client/js/render.js',
    'src/client/js/connection.js',
    'src/client/js/connection-state-machine.js',
    'src/client/js/battle-view-model.js',
    'src/client/js/dice-ui.js',
    'src/client/js/ui.js',
    'src/client/js/state.js',
  ];

  for (const relativePath of syncTargets) {
    const sourcePath = path.join(ROOT, relativePath);
    const portablePath = path.join(portableRoot, relativePath);
    if (!fs.existsSync(portablePath)) {
      findings.push(`release/GPP-Windows-Portable/${relativePath} missing (source: ${relativePath})`);
      continue;
    }

    const sourceContent = fs.readFileSync(sourcePath, 'utf8');
    const portableContent = fs.readFileSync(portablePath, 'utf8');
    if (sourceContent !== portableContent) {
      findings.push(`release/GPP-Windows-Portable/${relativePath} differs from ${relativePath}`);
    }
  }

  return findings;
}

function collectLegacyDocumentationReferences() {
  const findings = [];
  const docFiles = [
    ...listFiles(path.join(ROOT, 'docs')),
    ...listFiles(ROOT).filter((filePath) => path.extname(filePath).toLowerCase() === '.md'),
  ];
  const seen = new Set();
  const patterns = [
    /public\/js\//,
    /public\/(?:battle|index|replays|workshop)\.html/,
    /server\/entities\//,
    /scripts\/test_(?:battle_engine|protocol|connection_state_machine|replay_history)\.js/,
  ];
  const ignoredFiles = new Set([
    'CLAUDE.md',
    'docs/path-truth-table.md',
  ]);
  for (const filePath of docFiles) {
    const relativePath = rel(filePath);
    if (relativePath.startsWith('release/')) continue;
    if (ignoredFiles.has(relativePath)) continue;
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (patterns.some((pattern) => pattern.test(line))) {
        findings.push(`${relativePath}:${index + 1}: ${line.trim()}`);
      }
    }
  }
  return findings;
}

const runtimeSources = [
  'server.js -> src/server/app/bootstrap.js',
  'HTTP pages/css/js -> src/client/**',
  'Shared browser schemas -> src/core/shared/**',
  'Portrait assets -> public/portraits/**',
  'Battle content entities -> src/content/entities/**',
  'Server runtime/services -> src/server/**',
  'Pure battle engine -> src/core/battle-engine/**',
];

const compatShims = [
  'server/** -> re-export to src/server/** or src/core/**',
  'src/content/{dice,registry,rooms,skills,weather}.js -> re-export to src/server/services/**',
  'src/core/{registry,weather}.js -> re-export to src/server/services/**',
];

const staleMirrors = [];
const publicSet = getRelativeFileSet(path.join(ROOT, 'public'));
const clientSet = getRelativeFileSet(path.join(ROOT, 'src', 'client'));
for (const file of publicSet) {
  if (file.startsWith('portraits/')) continue;
  if (clientSet.has(file)) staleMirrors.push(`public/${file} (runtime source: src/client/${file})`);
}

const serverShimViolations = [];
for (const filePath of listFiles(path.join(ROOT, 'server'))) {
  const relativePath = rel(filePath);
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (relativePath === 'server/handlers_orig.js') continue;
  if (!/^module\.exports = require\(/.test(content)) {
    serverShimViolations.push(relativePath);
  }
}

const legacyToolPathReferences = collectLegacyToolPathReferences();
const legacyDocumentationReferences = collectLegacyDocumentationReferences();
const portableBattleRuntimeDrift = collectPortableBattleRuntimeDrift();

printSection('Runtime Source', runtimeSources);
printSection('Compat Shim', compatShims);
printSection('Stale Mirror', staleMirrors);
printSection('Server Shim Violations', serverShimViolations);
printSection('Legacy Tool Path References', legacyToolPathReferences);
printSection('Legacy Documentation References', legacyDocumentationReferences);
printSection('Portable Battle Runtime Drift', portableBattleRuntimeDrift);
