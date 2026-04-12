const fs = require('fs');

let css = fs.readFileSync('public/styles.css', 'utf8');

// 1. Replace dark background variables with light theme
css = css.replace(
  '--bg-0: #040726;',
  '--bg-0: #eef7ff;'
).replace(
  '--bg-1: #0a1454;',
  '--bg-1: #e2f2fb;'
).replace(
  '--bg-2: #0f2f82;',
  '--bg-2: #d6f0ea;'
).replace(
  '--text-soft: #a8bcf2;',
  '--text-soft: #4a6582;'
).replace(
  '--shadow: 0 14px 38px rgba(0, 0, 0, 0.45);',
  '--shadow: 0 8px 24px rgba(80, 140, 200, 0.18);'
);

// 2. Fix body background to use light theme gradients
css = css.replace(
  /body \{[\s\S]*?background: radial-gradient\(circle at 12% 8%,[\s\S]*?overflow-x: hidden;\r\n\}/,
  `body {\r\n  font-family: 'Rajdhani', 'Noto Sans SC', 'Microsoft YaHei UI', 'PingFang SC', sans-serif;\r\n  color: var(--text);\r\n  background: radial-gradient(circle at 20% 10%, #c8e8ff 0%, transparent 50%),\r\n    radial-gradient(circle at 80% 10%, #c8f0e0 0%, transparent 50%),\r\n    linear-gradient(170deg, #eef7ff, #e2f2fb 45%, #d6f0ea);\r\n  overflow-x: hidden;\r\n}`
);

// 3. Fix button base gradient (white left to light blue right)
css = css.replace(
  /background: linear-gradient\(140deg, rgba\(26, 61, 179, 0\.92\), rgba\(231, 244, 263, 0\.95\)\);/g,
  'background: linear-gradient(90deg, #ffffff 0%, #d8eaff 100%);'
);

// 4. Fix button.danger
css = css.replace(
  /button\.danger \{\r\n  background: linear-gradient\(140deg, rgba\(244, 244, 258, 0\.92\), rgba\(241, 242, 255, 0\.95\)\);\r\n  border-color: #1a2f4c;\r\n\}/,
  'button.danger {\r\n  background: linear-gradient(90deg, #ffffff 0%, #ffe0e4 100%);\r\n  border-color: rgba(200, 80, 100, 0.55);\r\n  color: #7a1a24;\r\n}'
);

// 5. Fix .primaryBtn
css = css.replace(
  /.primaryBtn \{\r\n  background: linear-gradient\(135deg, rgba\(35, 202, 255, 0\.95\), rgba\(0, 106, 255, 0\.92\)\);\r\n  border-color: #1a2f4c;\r\n  color: #04123f;\r\n  font-weight: 700;\r\n\}/,
  '.primaryBtn {\r\n  background: linear-gradient(90deg, #ffffff 0%, #a8d8f0 100%);\r\n  border-color: rgba(0, 130, 200, 0.6);\r\n  color: #0a2a40;\r\n  font-weight: 700;\r\n}'
);

// 6. Fix .accentBtn
css = css.replace(
  /.accentBtn \{\r\n  background: linear-gradient\(135deg, rgba\(255, 92, 226, 0\.95\), rgba\(130, 57, 255, 0\.96\)\);\r\n  border-color: #1a2f4c;\r\n\}/,
  '.accentBtn {\r\n  background: linear-gradient(90deg, #ffffff 0%, #f0d8f8 100%);\r\n  border-color: rgba(160, 60, 200, 0.5);\r\n  color: #4a1060;\r\n}'
);

// 7. Fix .secondaryBtn
css = css.replace(
  /.secondaryBtn \{\r\n  background: linear-gradient\(135deg, rgba\(233, 245, 263, 0\.9\), rgba\(232, 243, 259, 0\.95\)\);\r\n\}/,
  '.secondaryBtn {\r\n  background: linear-gradient(90deg, #ffffff 0%, #eef5ff 100%);\r\n  color: #2a4060;\r\n}'
);

// 8. Fix pendingSelection and confirmedSelection to be visible
css = css.replace(
  '.pendingSelection {\r\n  border-color: #1a2f4c;\r\n  box-shadow: inset 0 0 0 1px rgba(255, 210, 122, 0.45);\r\n}',
  '.pendingSelection {\r\n  border: 3px solid #f59e0b !important;\r\n  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25);\r\n  background: linear-gradient(90deg, #ffffff 0%, #fff8e0 100%) !important;\r\n}'
);
css = css.replace(
  '.confirmedSelection {\r\n  border-color: #1a2f4c;\r\n  box-shadow: 0 0 0 2px rgba(142, 244, 255, 0.2), inset 0 0 14px rgba(90, 246, 255, 0.17);\r\n}',
  '.confirmedSelection {\r\n  border: 3px solid #0ea5e9 !important;\r\n  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2);\r\n  background: linear-gradient(90deg, #ffffff 0%, #e0f5ff 100%) !important;\r\n}'
);

// 9. Fix duplicate border line in weatherBroadcast
css = css.replace(
  '  border: 2px solid #ffcc00;\r\n  border: 2px solid #ffcc00;\r\n  background: #fffcee;',
  '  border: 2px solid #e6b800;\r\n  background: #fffbe6;'
);

// 10. Hide workshopBtn and createVariantBtn (already appended, make sure it's there)
if (!css.includes('#workshopBtn, #createVariantBtn')) {
  css += '\n#workshopBtn, #createVariantBtn { display: none !important; }\n';
}

// 11. Fix bgGlowA and bgGlowB to be light colors
css = css.replace(
  '.bgGlowA {\r\n  width: 42vw;\r\n  height: 42vw;\r\n  border-radius: 50%;\r\n  top: -14vw;\r\n  left: -6vw;\r\n  background: #38a6ff;\r\n}',
  '.bgGlowA {\r\n  width: 42vw;\r\n  height: 42vw;\r\n  border-radius: 50%;\r\n  top: -14vw;\r\n  left: -6vw;\r\n  background: #90d0ff;\r\n}'
);
css = css.replace(
  '.bgGlowB {\r\n  width: 40vw;\r\n  height: 40vw;\r\n  border-radius: 50%;\r\n  right: -10vw;\r\n  top: 4vw;\r\n  background: #ff47cf;\r\n}',
  '.bgGlowB {\r\n  width: 40vw;\r\n  height: 40vw;\r\n  border-radius: 50%;\r\n  right: -10vw;\r\n  top: 4vw;\r\n  background: #90e8c0;\r\n}'
);

// 12. Fix panel and globalHeader backgrounds
css = css.replace(
  'background: linear-gradient(145deg, rgba(231, 243, 261, 0.88), rgba(231, 242, 257, 0.86));',
  'background: linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(225, 242, 255, 0.85));'
);
css = css.replace(
  'background: linear-gradient(155deg, var(--surface), rgba(231, 242, 257, 0.7));',
  'background: linear-gradient(155deg, var(--surface), rgba(215, 238, 255, 0.7));'
);

// 13. Fix h1 color from white to dark 
css = css.replace(
  'h1 {\r\n  font-size: clamp(28px, 3.2vw, 44px);\r\n  letter-spacing: 0.06em;\r\n  color: #f5f9ff;\r\n}',
  'h1 {\r\n  font-size: clamp(28px, 3.2vw, 44px);\r\n  letter-spacing: 0.06em;\r\n  color: #0d2040;\r\n}'
);

// 14. Fix zone backgrounds
css = css.replace(
  '.zoneEnemy {\r\n  background: linear-gradient(150deg, rgba(235, 243, 260, 0.56), rgba(233, 242, 258, 0.42));\r\n}',
  '.zoneEnemy {\r\n  background: linear-gradient(150deg, rgba(255, 235, 240, 0.5), rgba(255, 225, 235, 0.35));\r\n}'
);
css = css.replace(
  '.zoneSelf {\r\n  background: linear-gradient(150deg, rgba(232, 246, 263, 0.58), rgba(231, 244, 260, 0.42));\r\n}',
  '.zoneSelf {\r\n  background: linear-gradient(150deg, rgba(220, 240, 255, 0.5), rgba(210, 235, 255, 0.35));\r\n}'
);

// 15. Fix battleBoard background (make it a proper light field)
css = css.replace(
  /\.battleBoard \{\r\n  position: relative;\r\n  overflow: hidden;\r\n  border-radius: var\(--radius-lg\);\r\n  background:[^;]+;/,
  '.battleBoard {\r\n  position: relative;\r\n  overflow: hidden;\r\n  border-radius: var(--radius-lg);\r\n  background: linear-gradient(180deg, rgba(235, 248, 255, 0.9), rgba(225, 245, 235, 0.8));'
);

// 16. Fix zoneHeader h3 color
css = css.replace(
  '.zoneHeader h3 {\r\n  font-size: 26px;\r\n  color: #f3f7ff;\r\n}',
  '.zoneHeader h3 {\r\n  font-size: 26px;\r\n  color: #0d2040;\r\n}'
);

// 17. Fix roundInfo and turnInfo colors
css = css.replace(
  '.roundInfo {\r\n  color: #9ee4ff;\r\n  font-size: 15px;\r\n  letter-spacing: 0.04em;\r\n}',
  '.roundInfo {\r\n  color: #2a5a7a;\r\n  font-size: 15px;\r\n  letter-spacing: 0.04em;\r\n}'
);
css = css.replace(
  '.turnInfo {\r\n  color: #f3f8ff;\r\n  font-size: 18px;\r\n  font-weight: 700;\r\n}',
  '.turnInfo {\r\n  color: #0d2040;\r\n  font-size: 18px;\r\n  font-weight: 700;\r\n}'
);

fs.writeFileSync('public/styles.css', css);
console.log('Done! styles.css fixed.');

// Also fix launcher.css
let launcherCss = fs.readFileSync('public/launcher.css', 'utf8');
launcherCss = launcherCss.replace(
  /body \{[\s\S]*?background:[\s\S]*?\}(?=\r\n\r\n)/,
  `body {\r\n  font-family: 'Rajdhani', 'Noto Sans SC', 'Microsoft YaHei UI', 'PingFang SC', sans-serif;\r\n  color: #1a2f4c;\r\n  background: radial-gradient(circle at 15% 10%, #c8e8ff 0%, transparent 50%),\r\n    radial-gradient(circle at 85% 10%, #c0f0e0 0%, transparent 50%),\r\n    linear-gradient(160deg, #eef7ff, #e2f2fb 50%, #d6f0ea);\r\n}`
);
launcherCss = launcherCss.replace(
  /.launcherCard \{[\s\S]*?background: linear-gradient\(145deg, rgba\(17, 36, 117, 0\.88\), rgba\(12, 24, 79, 0\.86\)\);/,
  `.launcherCard {\r\n  width: min(560px, 100%);\r\n  border-radius: 18px;\r\n  border: 1px solid rgba(100, 170, 220, 0.4);\r\n  background: linear-gradient(145deg, rgba(255,255,255,0.92), rgba(220,240,255,0.88));`
);
launcherCss = launcherCss.replace('color: var(--text);', 'color: #1a2f4c;');
launcherCss = launcherCss.replace('color: #8ddfff;', 'color: #2a6a90;');
launcherCss = launcherCss.replace('background: linear-gradient(140deg, rgba(30, 68, 183, 0.92), rgba(18, 45, 136, 0.95));', 'background: linear-gradient(90deg, #ffffff 0%, #d8eaff 100%);');
launcherCss = launcherCss.replace('background: linear-gradient(135deg, rgba(36, 208, 255, 0.95), rgba(0, 112, 255, 0.92));', 'background: linear-gradient(90deg, #ffffff 0%, #a8d8f0 100%);');
launcherCss = launcherCss.replace('background: rgba(8, 16, 55, 0.92);', 'background: rgba(240, 248, 255, 0.95);');
fs.writeFileSync('public/launcher.css', launcherCss);
console.log('Done! launcher.css fixed.');
