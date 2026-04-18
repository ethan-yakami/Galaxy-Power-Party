# 模块职责附表

> Status: Active
> Audience: 所有 AI、贡献者、维护者 / All AI agents, contributors, and maintainers
> Must Read Before: 判断某个功能由谁负责；排查 battle 壳层、旧运行时、服务端、引擎、协议职责时
> Update When: 模块职责迁移、入口变更、新旧运行时分工变化、测试入口变化、工具链职责变化
> Last Verified Against Code: 2026-04-18
> Related Checks: `npm run audit:docs`, `npm run audit:paths`, `npm run test:node`, `npm run test:client`

这份附表按“功能由谁负责”整理仓库，帮助新手和 AI 快速定位真实实现，而不是掉进旧路径、compat shim 或派生产物。

## 总体原则

- 先问“这个行为属于哪个子系统”，再问“改哪个文件”。
- 先看真实负责目录，不要先去 compat 路径找同名文件。
- 如果改动涉及启动链路，优先看 `src/client/app/**` 或 `src/server/app/**`。
- 如果改动涉及 battle 运行时交互，优先看 `src/client/js/**` 和 `src/core/battle-engine/**`。

## 模块总览

| 你要处理的问题 | 真实负责目录 | 首个入口 | 不要先改哪里 |
| --- | --- | --- | --- |
| 服务启动、HTTP / WebSocket 挂载、平台装配 | `src/server/app/**`、`src/server/platform/**` | `server.js`、`src/server/app/bootstrap.js` | `server/**` |
| 房间生命周期、动作接入、服务端消息处理 | `src/server/app/handlers.js`、`src/server/transport/**`、`src/server/services/**` | `src/server/app/handlers.js` | compat shim |
| 战斗规则、状态、结算、投影 | `src/core/battle-engine/**` | `src/core/battle-engine/index.js` | `server/battle-engine/**` |
| 角色、曜彩、天气、自定义内容 | `src/content/entities/**` | `src/server/services/registry.js`、`src/server/services/weather.js` | 旧实体目录或 release 副本 |
| 战斗页页面壳层、启动、runtime loader、compat bridge | `src/client/app/**` | `src/client/battle.html`、`src/client/app/battle-entry.js` | 旧的 `public/` 页面思路 |
| battle 页运行时渲染、交互、连接、回放 UI | `src/client/js/**` | `src/client/js/render.js`、`src/client/js/connection.js` | `server/**` compat shim |
| 启动页、battle shell iframe、路由切换 | `src/client/app/**` | `src/client/app/launcher-entry.js`、`src/client/app/create-launcher-battle-shell.js` | 直接往 HTML 追加有顺序依赖的脚本 |
| 回放页、工坊页 | `src/client/app/**` + `src/client/js/**` | `src/client/app/replays-entry.js`、`src/client/app/workshop-entry.js` | release 副本页面 |
| 协议、回放 schema 与生成产物 | `src/core/shared/**`、`tools/dev/**` | `src/core/shared/protocol/schema.js`、`src/core/shared/replay-schema.js` | 只改生成文件 |
| 测试、审计、打包流程 | `tools/test/**`、`tools/dev/**`、`tools/build/**`、`.github/**` | `package.json`、对应脚本、CI workflow | `scripts/` 旧包装脚本 |

## 启动链路

### 服务端

- 根入口：`server.js`
- 真实启动：`src/server/app/bootstrap.js`
- 适合排查：
  - 服务起不来
  - 中间件、静态资源挂载错误
  - WebSocket 没有正确接入

### 启动页

- 页面入口：`src/client/index.html`
- 模块入口：`src/client/app/launcher-entry.js`
- 负责：
  - 预热启动页运行时
  - 创建 battle shell iframe
  - 把 launcher 的用户意图转发给 battle 页

### 战斗页

- 页面入口：`src/client/battle.html`
- 模块入口：`src/client/app/battle-entry.js`
- 负责：
  - 安装运行时配置
  - 创建 battle app context
  - 加载 legacy battle runtime
  - 暴露兼容桥接给旧运行时和 launcher shell

## battle 页新旧共存关系

这是当前仓库最容易误判的地方。

### `src/client/app/**` 负责什么

- 页面模块入口
- 壳层路由、launch intent 解析
- 运行时脚本加载器
- `window.GPP` 兼容桥的安装
- launcher shell 与 battle shell 的交接

关键入口：

- `src/client/app/battle-entry.js`
- `src/client/app/create-battle-app.js`
- `src/client/app/load-battle-runtime.js`
- `src/client/app/install-battle-compat-bridge.js`

### `src/client/js/**` 负责什么

- battle 页大部分已存在的运行时逻辑
- 渲染、连接、状态、骰子交互、UI 工具、回放
- 被 `load-battle-runtime.js` 按 runtime source manifest 动态加载

关键入口：

- `src/client/js/render.js`
- `src/client/js/connection.js`
- `src/client/js/state.js`
- `src/client/js/dice-ui.js`
- `src/client/js/replays.js`

### 如何判断先改哪边

- 页面还没正常启动、壳层切换失败、iframe 没准备好：先看 `src/client/app/**`
- 页面已经启动，但渲染、交互、Socket、状态更新不对：先看 `src/client/js/**`
- 需要对旧运行时暴露桥接接口：改 `install-battle-compat-bridge.js`
- 需要真正修改游戏规则：不要在 bridge 里改，去 `src/core/battle-engine/**`

### 明确禁止的误判

- 不要把 `window.GPP` 当成新代码的唯一主状态源
- 不要把 `install-battle-compat-bridge.js` 当成所有 battle 逻辑的归宿
- 不要把 `release/GPP-Windows-Portable/src/client/**` 当成当前 battle 页源码

## 服务端与引擎职责

### 服务端负责

- 房间生命周期
- 客户端消息分发
- 服务端状态管理
- AI 调度
- 回放导出
- 平台配置、认证、令牌、限流

先看这些文件：

- `src/server/app/handlers.js`
- `src/server/transport/message-router.js`
- `src/server/services/rooms.js`
- `src/server/services/registry.js`
- `src/server/services/replay.js`
- `src/server/ai/index.js`

### 引擎负责

- 纯战斗状态
- 动作应用与结算
- 随机与模拟
- 规则表与投影

先看这些文件：

- `src/core/battle-engine/index.js`
- `src/core/battle-engine/state.js`
- `src/core/battle-engine/reducer.js`
- `src/core/battle-engine/projector.js`
- `src/core/battle-engine/rules/*.js`

## 内容、协议、回放

### 内容定义

- 真实内容源：`src/content/entities/**`
- 内容装配与读取：`src/server/services/registry.js`
- 天气内容与兼容服务：`src/server/services/weather.js`

### 协议与回放

- 协议 schema 真相源：`src/core/shared/protocol/schema.js`
- 回放 schema 真相源：`src/core/shared/replay-schema.js`
- 相关历史读写：`src/client/js/replay-history.js`
- 生成与检查：`tools/dev/generate_protocol_artifacts.js`

## 测试与工具职责

| 目标 | 负责目录 | 先看哪里 |
| --- | --- | --- |
| Node 运行时与引擎测试 | `tools/test/**` | `tools/test/test_battle_engine.js`、相关 `test_*` |
| 客户端模块测试 | `src/client/app/*.test.js`、Vitest | `npm run test:client` |
| 路径与边界审计 | `tools/dev/**` | `audit_paths.js`、`audit_boundaries.js`、`audit_docs.js` |
| 便携版打包 | `tools/build/**` | `tools/build/build_portable.ps1` |
| CI 门禁 | `.github/workflows/**` | `ci.yml` |

## 定位速记

- “战斗规则不对”：先看 `src/core/battle-engine/**`
- “角色或天气定义不对”：先看 `src/content/entities/**`
- “房间同步、消息路由、服务端状态不对”：先看 `src/server/**`
- “battle 页启动失败、壳层切换异常”：先看 `src/client/app/**`
- “battle 页已打开，但渲染或交互异常”：先看 `src/client/js/**`
- “改了 `server/**` 却没生效”：大概率改到了 compat shim
- “改了 `release/**` 却没生效”：大概率改到了派生产物，不是主源码
