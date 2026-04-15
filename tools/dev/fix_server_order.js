const fs = require('fs');

async function fix() {
  const filePath = 'server.js';
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix ordering of reconnectToken and playerId
  const badBlock = '  ws.playerId = `P${nextPlayerId++}_${ws.reconnectToken.slice(0, 8)}`;\n  ws.playerRoomCode = null;\n  ws.reconnectToken = randomBytes(24).toString(\'hex\');';
  const goodBlock = '  ws.reconnectToken = randomBytes(24).toString(\'hex\');\n  ws.playerId = `P${nextPlayerId++}_${ws.reconnectToken.slice(0, 8)}`;\n  ws.playerRoomCode = null;';

  if (content.includes(badBlock)) {
    content = content.replace(badBlock, goodBlock);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully fixed ordering in server.js');
  } else {
    // Try a more flexible replacement if exact match fails
    const lines = content.split('\n');
    let pIdx = -1;
    let rIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('ws.playerId = `P${nextPlayerId++}')) pIdx = i;
        if (lines[i].includes('ws.reconnectToken = randomBytes(24)')) rIdx = i;
    }
    if (pIdx !== -1 && rIdx !== -1 && pIdx < rIdx) {
        const temp = lines[pIdx];
        lines[pIdx] = lines[rIdx];
        lines[rIdx] = temp;
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log('Successfully swapped lines in server.js');
    } else {
        console.error('Could not find lines to swap in server.js');
    }
  }
}

fix();
