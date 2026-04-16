/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-no-server',
      comment: 'src/core must stay server-agnostic',
      from: { path: '^src/core' },
      to: { path: '^src/server' },
    },
    {
      name: 'core-no-client',
      comment: 'src/core must stay browser-agnostic',
      from: { path: '^src/core' },
      to: { path: '^src/client' },
    },
    {
      name: 'client-no-server',
      comment: 'src/client cannot import server runtime',
      from: { path: '^src/client' },
      to: { path: '^src/server' },
    },
    {
      name: 'server-no-client',
      comment: 'src/server cannot import browser runtime',
      from: { path: '^src/server' },
      to: { path: '^src/client' },
    },
    {
      name: 'client-only-shared-from-core',
      comment: 'src/client may only consume src/core/shared from the core tree',
      from: { path: '^src/client' },
      to: {
        path: '^src/core/(?!shared)',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    includeOnly: '^src',
    tsPreCompilationDeps: false,
    combinedDependencies: true,
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+',
      },
    },
  },
};
