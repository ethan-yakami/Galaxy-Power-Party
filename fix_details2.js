const fs = require('fs');

// 1. Update gradients in styles.css to be white on left
let styles = fs.readFileSync('public/styles.css', 'utf8');
styles = styles.replace(/button\s*{\s*([^}]*?)background:\s*linear-gradient\([^)]+\);\s*([^}]*?)}/g, function(match, p1, p2) {
    return `button { ${p1}background: linear-gradient(90deg, #ffffff 0%, #d8eaff 100%); ${p2}}`;
});
styles = styles.replace(/\.primaryBtn\s*{\s*([^}]*?)background:\s*linear-gradient\([^)]+\);\s*([^}]*?)}/g, function(match, p1, p2) {
    return `.primaryBtn { ${p1}background: linear-gradient(90deg, #ffffff 0%, #aee0ff 100%); ${p2}}`;
});
styles = styles.replace(/\.secondaryBtn\s*{\s*([^}]*?)background:\s*linear-gradient\([^)]+\);\s*([^}]*?)}/g, function(match, p1, p2) {
    return `.secondaryBtn { ${p1}background: linear-gradient(90deg, #ffffff 0%, #eef5ff 100%); ${p2}}`;
});
styles = styles.replace(/\.danger\s*{\s*([^}]*?)background:\s*linear-gradient\([^)]+\);\s*([^}]*?)}/g, function(match, p1, p2) {
    return `.danger { ${p1}background: linear-gradient(90deg, #ffffff 0%, #ffe6eb 100%); ${p2}}`;
});
styles = styles.replace(/\button\.danger\s*{\s*([^}]*?)background:\s*linear-gradient\([^)]+\);\s*([^}]*?)}/g, function(match, p1, p2) {
    return `button.danger { ${p1}background: linear-gradient(90deg, #ffffff 0%, #ffe6eb 100%); ${p2}}`;
});

// Update tooltip hints to be larger
styles = styles.replace(/\.glossTipText\s*{([^}]+)}/g, function(m, inner) {
    return `.glossTipText {${inner.replace(/min-width:\s*[^;]+;/, 'min-width: 280px;').replace(/max-width:\s*[^;]+;/, 'max-width: 500px;').replace(/padding:\s*[^;]+;/, 'padding: 12px 16px;').replace(/font-size:\s*[^;]+;/, 'font-size: 17px;')}}`;
});
styles = styles.replace(/\.tooltip\s*{([^}]+)}/g, function(m, inner) {
    return `.tooltip {${inner.replace(/min-width:\s*[^;]+;/, 'min-width: 280px;').replace(/padding:\s*[^;]+;/, 'padding: 12px 16px;').replace(/font-size:\s*[^;]+;/, 'font-size: 17px;')}}`;
});

// Weather Broadcast
styles = styles.replace(/\.weatherBroadcast\s*{([^}]+)}/g, function(m, inner) {
    let replaced = inner.replace(/background:\s*[^;]+;/g, 'background: #fffcee;');
    replaced = replaced.replace(/color:\s*[^;]+;/g, 'color: #7b5e00;');
    replaced = replaced.replace(/border[a-z-]*:\s*[^;]+;/g, 'border: 2px solid #ffcc00;');
    return `.weatherBroadcast {${replaced}}`;
});
styles += '\n/* Hide workshop */\n#workshopBtn, #createVariantBtn { display: none !important; }\n';
fs.writeFileSync('public/styles.css', styles);

// 2. Clear custom_characters (yaoguang v2, xilian v2)
fs.writeFileSync('server/entities/custom_characters.json', JSON.stringify({ variants: [] }, null, 2));

// 3. Remove "路" text inside render.js
let renderJs = fs.readFileSync('public/js/render.js', 'utf8');
renderJs = renderJs.replace(/ 路 /g, '    ');
fs.writeFileSync('public/js/render.js', renderJs);

// 4. Update weatherBroadcast duration in ui.js
let uiJs = fs.readFileSync('public/js/ui.js', 'utf8');
uiJs = uiJs.replace(/setTimeout\(\(\) => \{\s*hideWeatherBroadcast\(node\);\s*weatherBroadcastTimer = null;\s*\}, 2000\);/g, `setTimeout(() => {
      hideWeatherBroadcast(node);
      weatherBroadcastTimer = null;
    }, 4500);`);
fs.writeFileSync('public/js/ui.js', uiJs);

