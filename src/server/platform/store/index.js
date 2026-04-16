const { createMemoryStore } = require('./memory-store');
const { createPrismaStore } = require('./prisma-store');

function createStore(config) {
  if (config && config.provider === 'prisma') {
    return createPrismaStore(config);
  }
  return createMemoryStore();
}

module.exports = {
  createStore,
};
