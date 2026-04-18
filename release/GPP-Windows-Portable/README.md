# 银河战力党（Galaxy Power Party）

2 人 WebSocket 骰子对战网页游戏，Node.js + Express + 原生前端实现。

## 文档导航

开始改代码、改路径、改协议、做打包前，请先读：

- [仓库维护总手册](./docs/repo-maintenance-handbook.md)
- [路径与版本状态附表](./docs/path-truth-table.md)
- [模块职责附表](./docs/module-manual.md)

- [架构总览](./docs/architecture-overview.md)
- [开发入门](./docs/developer-onboarding.md)
- [协议总览](./docs/protocol-overview.md)
- [错误码目录](./docs/error-catalog.md)
- [回放格式与迁移](./docs/replay-format-and-migration.md)
- [版本兼容策略](./docs/version-compatibility.md)
- [排障手册](./docs/troubleshooting.md)
- [扩展开发手册](./docs/extension-handbook.md)
- [引擎流程文档](./docs/engine-process.md)
- [工作区边界说明](./docs/workspace-boundaries.md)
- [协议生成链路说明](./docs/protocol-codegen.md)

## 快速开始

### 开发模式

```bash
npm install
npm start
```

### 便携运行

- `start_game.bat`
- `stop_game.bat`

### 公网分享

- `start_online.bat`

运行日志和 pid 统一落在 `tmp/runtime/`。

## 质量门禁

```bash
npm test
```

这会串联执行：

- `audit:docs`
- `audit:paths`
- `audit:encoding`
- `lint`
- `typecheck`
- `depcruise`
- `audit:boundaries`
- `protocol:check`
- Node 测试
- Vitest 客户端测试

## 当前工程方向

- battle 页已经切到单入口模块壳层，HTML 不再手写 ordered scripts
- `window.GPP` 只保留旧运行时兼容桥，不再是新代码的主状态源
- 协议、错误码、版本兼容和排障文档已形成正式入口
- 根目录只保留运行入口、配置和正式文档；历史分析稿归档到 `docs/archive/analysis/`

## 目录约定

- `src/server/**`：服务端运行时、房间、协议、AI、日志
- `src/core/**`：纯规则、共享 schema、回放与协议定义
- `src/content/entities/**`：角色、天气、光环骰和自定义内容
- `src/client/**`：浏览器页面、壳层、渲染、交互
- `tools/**`：测试、协议生成、构建、审计工具

## 运行时接口

- 公共房间列表：`GET /api/public-rooms`
- 版本信息：`GET /api/version`
- 调试房间指标：`GET /api/debug/room-metrics`

## 维护规则

- 改运行时行为，请改 `src/`
- `server/` 目录只保留 compat shim
- `public/` 只放静态资源，不再放运行时 HTML / CSS / JS
## Local Startup Contract

- `npm start` is the standard local startup path and does not require `vite build` or `npm run build:client`.
- `start_game.bat` follows the same contract and should work without any prebuild step.
- `npm run build:client` is only for release/static build output validation and deployment packaging.
