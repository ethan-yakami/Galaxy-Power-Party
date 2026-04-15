const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');
ws.on('open', () => {
    console.log('Connected');
    ws.send(JSON.stringify({ type: 'create_ai_room', name: '玩家735' }));
});
ws.on('message', (data) => {
    console.log('Recv:', data.toString());
    process.exit(0);
});
ws.on('close', () => console.log('Closed'));
ws.on('error', (err) => console.error('Error:', err));
