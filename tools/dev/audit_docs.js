const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const REQUIRED_DOCS = [
  'docs/repo-maintenance-handbook.md',
  'docs/path-truth-table.md',
  'docs/module-manual.md',
];

const METADATA_LABELS = [
  'Status',
  'Audience',
  'Must Read Before',
  'Update When',
  'Last Verified Against Code',
  'Related Checks',
];

const HANDBOOK_LINK_FILES = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
];

const issues = [];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function addIssue(message) {
  issues.push(message);
}

function assertExists(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    addIssue(`Missing required documentation file: ${relativePath}`);
    return false;
  }
  return true;
}

function assertMetadata(relativePath) {
  const content = readUtf8(relativePath);
  const header = content.split(/\r?\n/).slice(0, 20).join('\n');
  for (const label of METADATA_LABELS) {
    const pattern = new RegExp(`(?:^|\\n)\\s*>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm');
    if (!pattern.test(header)) {
      addIssue(`Missing metadata label "${label}" in ${relativePath}`);
    }
  }
}

function assertHandbookLinks() {
  for (const relativePath of HANDBOOK_LINK_FILES) {
    const content = readUtf8(relativePath);
    if (!content.includes('repo-maintenance-handbook.md')) {
      addIssue(`Missing handbook link reference in ${relativePath}`);
    }
  }
}

function assertReadmeFirstDocEntry() {
  const content = readUtf8('README.md');
  const navStart = content.indexOf('## 文档导航');
  if (navStart < 0) {
    addIssue('README.md is missing the "## 文档导航" section');
    return;
  }
  const navLines = content.slice(navStart).split(/\r?\n/).slice(1);
  const firstBullet = navLines.find((line) => /^\s*-\s+\[/.test(line));
  if (!firstBullet) {
    addIssue('README.md 文档导航缺少列表入口');
    return;
  }
  if (!firstBullet.includes('repo-maintenance-handbook.md')) {
    addIssue('README.md must list docs/repo-maintenance-handbook.md as the first documentation entry');
  }
}

function assertPrTemplateRules() {
  const content = readUtf8('.github/PULL_REQUEST_TEMPLATE.md');
  const requiredSnippets = [
    '已更新受影响文档',
    '本次无需更新文档，原因：',
    '文档影响说明',
  ];
  for (const snippet of requiredSnippets) {
    if (!content.includes(snippet)) {
      addIssue(`PR template is missing required docs section text: ${snippet}`);
    }
  }
}

function main() {
  for (const relativePath of REQUIRED_DOCS) {
    if (assertExists(relativePath)) {
      assertMetadata(relativePath);
    }
  }

  assertHandbookLinks();
  assertReadmeFirstDocEntry();
  assertPrTemplateRules();

  if (issues.length) {
    console.error(`audit_docs failed (${issues.length} issue(s))`);
    for (const issue of issues) {
      console.error(` - ${issue}`);
    }
    process.exit(1);
  }

  console.log('audit_docs passed');
}

main();
