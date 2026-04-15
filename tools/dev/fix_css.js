const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function resolveFromRoot(...segments) {
    return path.join(ROOT, ...segments);
}

function fixCSS(filePath) {
    if (!fs.existsSync(filePath)) return;
    let css = fs.readFileSync(filePath, 'utf8');

    // Fix the concatenated hex colors from previous script
    css = css.replace(/#1a2f4c[0-9a-fA-F]+/g, '#1a2f4c');
    
    // Ensure all bright text colors become dark
    css = css.replace(/color:\s*#[fF][0-9a-fA-F]{2,5}/g, 'color: #1a2f4c');
    css = css.replace(/color:\s*#e[0-9a-fA-F]{5}/g, 'color: #1a2f4c');
    css = css.replace(/color:\s*#d[0-9a-fA-F]{5}/g, 'color: #1a2f4c');
    css = css.replace(/color:\s*#c[0-9a-fA-F]{5}/g, 'color: #1a2f4c');
    css = css.replace(/color:\s*#b[0-9a-fA-F]{5}/g, 'color: #4a6582');
    css = css.replace(/color:\s*#a[0-9a-fA-F]{5}/g, 'color: #4a6582');

    // Fix other light colors that might be on light backgrounds
    css = css.replace(/color:\s*#9[0-9a-fA-F]{5}/g, 'color: #2c4a6b');
    css = css.replace(/color:\s*#8[0-9a-fA-F]{5}/g, 'color: #1e3a5f');

    // Ensure .dieLabel text and shadow fits
    css = css.replace(/\.dieLabel\s*{[^}]+}/, (match) => {
        return match.replace(/color:\s*[^;]+;/, 'color: #ffffff;').replace(/text-shadow:\s*[^;]+;/, 'text-shadow: 0 2px 4px rgba(0,0,0,0.4);');
    });

    // Make HP Badge text white so it reads well on its loud background
    css = css.replace(/\.hpBadge\s*{[^}]+}/, (match) => {
        return match.replace(/color:\s*[^;]+;/, 'color: #112a4a;');
    });

    // Make dice shapes pop more on light theme
    css = css.replace(/\.shape-aurora\s*{[^}]+}/, (match) => {
         return match.replace(/background:\s*[^;]+;/, 'background: radial-gradient(circle at 30% 30%, rgba(100, 200, 255, 0.96), rgba(30, 80, 230, 0.9));');
    });

    fs.writeFileSync(filePath, css);
}

fixCSS(resolveFromRoot('src', 'client', 'styles.css'));
fixCSS(resolveFromRoot('src', 'client', 'launcher.css'));
fixCSS(resolveFromRoot('src', 'client', 'workshop.css'));
