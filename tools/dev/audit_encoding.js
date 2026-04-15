const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BASELINE_PATH = path.join(__dirname, 'encoding-baseline.json');
const SHOULD_WRITE_BASELINE = process.argv.includes('--write-baseline');

const SCAN_ROOTS = ['src', 'tools', 'docs', 'README.md', 'README.en.md', 'README.jp.md', 'AGENTS.md'];
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.md', '.html', '.css', '.txt', '.yml', '.yaml', '.toml', '.ps1', '.bat']);
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'archive']);

// Covers common mojibake clusters seen in this repository and generic UTF-8 garble markers.
const SUSPICIOUS_REGEXES = [
  /[\u95c2\u95ba\u93c9\u941c\u93b4\u92c6\u5a13\u7f01]{2,}/u,
  /Ã[\u0080-\u00BF]/u,
  /â[\u0080-\u00BF]{1,2}/u,
];

function toUnixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return path.basename(filePath) === 'AGENTS.md';
}

function walk(targetPath, out) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    out.push(targetPath);
    return;
  }
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    walk(path.join(targetPath, entry.name), out);
  }
}

function issueKey(issue) {
  return `${issue.file}:${issue.line}:${issue.type}:${issue.snippet}`;
}

function findIssuesInFile(filePath) {
  if (!isTextFile(filePath)) return [];
  const rel = toUnixPath(path.relative(ROOT, filePath));
  const buf = fs.readFileSync(filePath);
  const issues = [];

  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    issues.push({ file: rel, line: 1, type: 'bom', snippet: 'UTF-8 BOM' });
  }

  const content = buf.toString('utf8');
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes('\uFFFD')) {
      issues.push({
        file: rel,
        line: i + 1,
        type: 'replacement_char',
        snippet: line.trim().slice(0, 120),
      });
    }
    for (const regex of SUSPICIOUS_REGEXES) {
      const match = line.match(regex);
      if (!match) continue;
      issues.push({
        file: rel,
        line: i + 1,
        type: 'suspicious_fragment',
        snippet: match[0],
      });
    }
  }
  return issues;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return Array.isArray(parsed.issues) ? parsed.issues : [];
  } catch {
    return [];
  }
}

function saveBaseline(issues) {
  const payload = {
    generatedAt: new Date().toISOString(),
    issues: issues.slice().sort((a, b) => issueKey(a).localeCompare(issueKey(b))),
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    walk(path.join(ROOT, root), files);
  }

  const allIssues = [];
  for (const filePath of files) {
    allIssues.push(...findIssuesInFile(filePath));
  }

  if (SHOULD_WRITE_BASELINE) {
    saveBaseline(allIssues);
    console.log(`encoding baseline updated: ${toUnixPath(path.relative(ROOT, BASELINE_PATH))} (${allIssues.length} issues)`);
    return;
  }

  const baseline = loadBaseline();
  const baselineSet = new Set(baseline.map(issueKey));
  const regressions = allIssues.filter((issue) => !baselineSet.has(issueKey(issue)));
  if (!regressions.length) {
    console.log(`audit_encoding passed (${allIssues.length} known issues, no regressions)`);
    return;
  }

  console.error(`audit_encoding failed: ${regressions.length} regression(s) found.`);
  for (const issue of regressions.slice(0, 80)) {
    console.error(` - ${issue.file}:${issue.line} [${issue.type}] ${issue.snippet}`);
  }
  if (regressions.length > 80) {
    console.error(` ... and ${regressions.length - 80} more`);
  }
  process.exit(1);
}

main();

