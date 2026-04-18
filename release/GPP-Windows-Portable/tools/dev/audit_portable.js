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

  const publicFiles = listRelativeFiles(path.join(PORTABLE_ROOT, 'public'));
  const stalePublicFiles = publicFiles.filter((file) => (
    file.endsWith('.html') || file.endsWith('.css') || file.startsWith('js/')
  ));
  for (const file of stalePublicFiles) {
    failures.push(`Portable package contains stale public runtime file: public/${file}`);
  }

  [
    'package.json',
    'package-lock.json',
    'README.md',
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
