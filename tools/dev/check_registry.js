const { CharacterRegistry, AuroraRegistry } = require('../../src/server/services/registry');
console.log('--- Registry Check ---');
console.log('Character count:', Object.keys(CharacterRegistry).length);
console.log('Character IDs:', Object.keys(CharacterRegistry));
console.log('Aurora count:', Object.keys(AuroraRegistry).length);
console.log('Aurora IDs:', Object.keys(AuroraRegistry));
