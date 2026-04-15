const fs = require('fs');

async function fix() {
  const filePath = 'server.js';
  let content = fs.readFileSync(filePath, 'utf8');

  // Align playerId generation format to P{n}_{token_prefix}
  const oldLine = '  ws.playerId = `P${nextPlayerId++}`;';
  const newLine = '  ws.reconnectToken = randomBytes(24).toString(\'hex\');\n  ws.playerId = `P${nextPlayerId++}_${ws.reconnectToken.slice(0, 8)}`;';

  if (content.includes(oldLine)) {
    content = content.replace(oldLine, newLine);
    
    // Also remove the old reconnectToken assignment which happened later
    content = content.replace('  ws.reconnectToken = randomBytes(24).toString(\'hex\');\n', '');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully patched server.js');
  } else {
    console.error('Target line not found in server.js');
  }
}

fix();
