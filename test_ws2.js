const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');
ws.on('open', () => {
    console.log('Connected');
    ws.send(JSON.stringify({ type: 'create_ai_room', name: '玩家735' }));
    
    // Simulate picking character and aurora
    setTimeout(() => {
        ws.send(JSON.stringify({ type: 'choose_character', characterId: 'xiadie' }));
        ws.send(JSON.stringify({ type: 'choose_aurora_die', auroraDiceId: 'starshield' }));
        console.log('Choices sent');
    }, 500);
});
ws.on('message', (data) => {
    console.log('Recv:', data.toString().substring(0, 100)); // Truncate so it is readable
});
ws.on('close', () => console.log('Closed'));
ws.on('error', (err) => console.error('Error:', err));
