const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SHIM_DIR = path.join(ROOT, 'server');
const PUBLIC_DIR = path.join(ROOT, 'public');

const issues = [];

function toUnixPath(value) {
  return value.split(path.sep).join('/');
}

function relativePath(filePath) {
  return toUnixPath(path.relative(ROOT, filePath));
}

function addIssue(message) {
  issues.push(message);
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walkFiles(targetPath, out) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    out.push(targetPath);
    return;
  }
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    walkFiles(path.join(targetPath, entry.name), out);
  }
}

function auditRuntimeRoots() {
  const requiredDirs = [
    'src/core',
    'src/server',
    'src/client',
    'src/content/entities',
    'tools/dev',
    'tools/test',
  ];
  for (const rel of requiredDirs) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      addIssue(`Missing runtime boundary directory: ${rel}`);
    }
  }
}

function auditServerEntry() {
  const entryPath = path.join(ROOT, 'server.js');
  if (!fs.existsSync(entryPath)) {
    addIssue('Missing server.js entry file');
    return;
  }
  const text = readUtf8(entryPath);
  if (!text.includes("./src/server/app/bootstrap") && !text.includes("'./src/server/app/bootstrap'")) {
    addIssue('server.js must bootstrap from src/server/app/bootstrap');
  }
}

function auditServerCompatShims() {
  if (!fs.existsSync(SHIM_DIR)) return;
  const files = [];
  walkFiles(SHIM_DIR, files);
  const shimRegex = /^module\.exports\s*=\s*require\((['"]).+\1\);\s*$/;
  for (const file of files) {
    if (path.extname(file).toLowerCase() !== '.js') continue;
    const normalized = readUtf8(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .trim();
    if (!shimRegex.test(normalized)) {
      addIssue(`Compat shim must only re-export target module: ${relativePath(file)}`);
    }
  }
}

function auditPublicAssetsOnly() {
  if (!fs.existsSync(PUBLIC_DIR)) return;
  const files = [];
  walkFiles(PUBLIC_DIR, files);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.html' || ext === '.js' || ext === '.css') {
      addIssue(`public/ should contain assets only (found runtime file): ${relativePath(file)}`);
    }
  }
}

function auditWeatherSingleSource() {
  const coreWeatherPath = path.join(ROOT, 'src/core/weather.js');
  const serverWeatherPath = path.join(ROOT, 'src/server/services/weather.js');
  if (fs.existsSync(coreWeatherPath)) {
    const text = readUtf8(coreWeatherPath);
    if (!text.includes("../content/entities/weather") && !text.includes("'../content/entities/weather'")) {
      addIssue('src/core/weather.js must re-export src/content/entities/weather');
    }
  }
  if (fs.existsSync(serverWeatherPath)) {
    const text = readUtf8(serverWeatherPath);
    if (!text.includes("../../content/entities/weather") && !text.includes("'../../content/entities/weather'")) {
      addIssue('src/server/services/weather.js must import src/content/entities/weather');
    }
  }
}

function main() {
  auditRuntimeRoots();
  auditServerEntry();
  auditServerCompatShims();
  auditPublicAssetsOnly();
  auditWeatherSingleSource();

  if (issues.length) {
    console.error(`audit_boundaries failed (${issues.length} issue(s))`);
    for (const issue of issues) {
      console.error(` - ${issue}`);
    }
    process.exit(1);
  }

  console.log('audit_boundaries passed');
}

main();
