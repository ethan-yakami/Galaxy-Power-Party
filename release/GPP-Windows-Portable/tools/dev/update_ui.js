const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function resolveFromRoot(...segments) {
    return path.join(ROOT, ...segments);
}

function transformCSS(filePath) {
    let css = fs.readFileSync(filePath, 'utf8');

    // 1. Convert text colors to dark
    css = css.replace(/color:\s*#[a-fd]{3,6}/gi, 'color: #1a2f4c');
    css = css.replace(/color:\s*rgba\([\d,\s.]+\)/gi, 'color: #1a2f4c');
    css = css.replace(/--text:\s*#[a-fd]{3,6}/gi, '--text: #1a2f4c');
    css = css.replace(/--text-soft:\s*#[a-fd]{3,6}/gi, '--text-soft: #4a6582');

    // 2. Convert dark backgrounds to light backgrounds
    css = css.replace(/background:\s*#040726/g, 'background: #eef7ff');
    css = css.replace(/--bg-0:\s*#[a-fd]+/gi, '--bg-0: #f4fafe');
    css = css.replace(/--bg-1:\s*#[a-fd]+/gi, '--bg-1: #e1f4fc');
    css = css.replace(/--bg-2:\s*#[a-fd]+/gi, '--bg-2: #d8f5ef'); // light green hint
    css = css.replace(/--surface:\s*rgba\([\d,\s.]+\)/gi, '--surface: rgba(255, 255, 255, 0.85)');
    css = css.replace(/--surface-strong:\s*rgba\([\d,\s.]+\)/gi, '--surface-strong: rgba(255, 255, 255, 0.95)');
    css = css.replace(/--line:\s*rgba\([\d,\s.]+\)/gi, '--line: rgba(135, 190, 230, 0.5)');
    
    // Invert all background and border rgba values (making them light)
    css = css.replace(/(background(?:-color)?|border(?:-color)?|box-shadow):\s*([^;]+);/g, (match, prop, val) => {
        let newVal = val.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/g, (m, r, g, b, a) => {
            // If it's a dark color (R, G, B < 150), lighten it to a light blue/green
            let rI = parseInt(r), gI = parseInt(g), bI = parseInt(b);
            if (rI < 150 && gI < 150 && bI < 150) {
                // Map to soft light colors: e.g., 230, 245, 255
                rI = 230 + Math.floor(rI / 10);
                gI = 240 + Math.floor(gI / 10);
                bI = 250 + Math.floor(bI / 10);
                if (prop.includes('border')) {
                    // Borders slightly darker blue
                    rI -= 40; gI -= 20; bI -= 10;
                }
            } else if (prop.includes('border') || prop.includes('shadow')) {
                // Keep some neon highlights if already bright, just maybe tone down
            }
            return `rgba(${rI}, ${gI}, ${bI}, ${a})`;
        });
        
        // Convert dark hexes to light
        newVal = newVal.replace(/#([0-9a-fA-F]{6})/g, (m, hex) => {
             let r = parseInt(hex.slice(0,2), 16);
             let g = parseInt(hex.slice(2,4), 16);
             let b = parseInt(hex.slice(4,6), 16);
             if (r < 100 && g < 100 && b < 100) {
                 return '#e8f4fb';
             }
             return m;
        });

        return `${prop}: ${newVal};`;
    });

    // 3. Typography & Size enhancements
    // Hp Badge
    css = css.replace(/\.hpBadge {[^}]+}/, (match) => {
        return match.replace(/font-size:\s*[\d]+px/, 'font-size: 42px').replace(/min-width:\s*[\d]+px/, 'min-width: 130px');
    });

    // atkDefBox
    css = css.replace(/\.atkDefBox {[^}]+}/, (match) => {
        return match.replace(/font-size:\s*[\d]+px/, 'font-size: 24px');
    });

    // battleCenterScore
    css = css.replace(/\.battleCenterScore {[^}]+}/, (match) => {
        return match.replace(/font-size:\s*clamp\([^)]+\)/, 'font-size: clamp(34px, 4vw, 56px)');
    });

    // Sub labels (zone role, weather label)
    css = css.replace(/font-size:\s*12px/g, 'font-size: 15px');
    css = css.replace(/font-size:\s*13px/g, 'font-size: 16px');
    css = css.replace(/font-size:\s*14px/g, 'font-size: 16px');

    // Dice scaling and animation
    css = css.replace(/\.dieLabel\s*{[^}]+}/, (match) => {
        return match.replace(/font-size:\s*[\d]+px/, 'font-size: 32px');
    });
    
    // Add micro animations (pulse to selected dice)
    if (!css.includes('pulseSelectedDie')) {
        css += `
@keyframes pulseSelectedDie {
  0% { transform: scale(1.12) translateY(-4px); box-shadow: 0 0 15px rgba(255, 214, 82, 0.4); }
  50% { transform: scale(1.15) translateY(-6px); box-shadow: 0 0 25px rgba(255, 214, 82, 0.8); }
  100% { transform: scale(1.12) translateY(-4px); box-shadow: 0 0 15px rgba(255, 214, 82, 0.4); }
}
.die.selected {
  animation: pulseSelectedDie 1.5s infinite alternate ease-in-out;
  border: 3px solid #ffcc00 !important;
  background: white !important;
  color: black !important;
}
.die.selected .dieLabel { color: black !important; text-shadow: none; }
`;
    }
    
    fs.writeFileSync(filePath, css);
}

transformCSS(resolveFromRoot('src', 'client', 'styles.css'));
try { transformCSS(resolveFromRoot('src', 'client', 'launcher.css')); } catch(e){}
try { transformCSS(resolveFromRoot('src', 'client', 'workshop.css')); } catch(e){}
