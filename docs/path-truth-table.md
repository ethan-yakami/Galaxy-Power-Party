# 路径真相表

本文定义当前仓库中哪些目录是运行时真相、哪些目录只是兼容层，以及哪些历史路径不应再被当作源码入口。

## 运行时真相

| 分类 | 目录 / 入口 | 当前角色 | 说明 |
| --- | --- | --- | --- |
| runtime source | `server.js` | 根启动入口 | 仅负责启动 `src/server/app/bootstrap.js`。 |
| runtime source | `src/server/**` | 服务端运行时代码 | Express、WebSocket、消息路由、房间与服务逻辑。 |
| runtime source | `src/core/**` | 纯引擎与共享 schema | 战斗引擎、投影器、共享浏览器 schema。 |
| runtime source | `src/content/entities/**` | 内容实体 | 角色、曜彩、天气、自定义内容存储。 |
| runtime source | `src/client/**` | 前端页面与浏览器脚本 | `/`、`/battle.html`、`/replays.html`、`/workshop.html` 的真实来源。 |
| runtime source | `public/portraits/**` | 角色立绘资源 | 通过 `/portraits/*` 对外提供。 |
| runtime source | `picture/**` | 附加静态资源 | 通过 `/picture/*` 对外提供。 |
| runtime source | `src/core/shared/**` | 共享浏览器脚本 | 通过 `/shared/*` 对外提供。 |

## 兼容层

| 分类 | 目录 / 入口 | 当前角色 | 说明 |
| --- | --- | --- | --- |
| compat shim | `server/**` | Node 兼容导出层 | 只允许 `module.exports = require(...)` 形式的 re-export。 |
| compat shim | `server/battle-engine/**` | 旧引擎路径兼容层 | 统一转到 `src/core/battle-engine/**`。 |
| compat shim | `src/content/{dice,registry,rooms,skills,weather}.js` | 旧内容入口兼容层 | 统一转到 `src/server/services/**`。 |
| compat shim | `src/core/{registry,weather}.js` | 旧核心入口兼容层 | 统一转到 `src/server/services/**`。 |

## 不再使用的历史路径

| 分类 | 目录 / 入口 | 状态 | 说明 |
| --- | --- | --- | --- |
| stale mirror | `public/*.html` | 已废弃 | 不再承载运行时页面。 |
| stale mirror | `public/*.css` | 已废弃 | 不再承载运行时样式。 |
| stale mirror | `public/js/**` | 已废弃 | 不再承载运行时浏览器脚本。 |
| stale path | `server/entities/**` | 已废弃 | 内容实体真实来源已迁到 `src/content/entities/**`。 |
| stale path | `scripts/test_*.js` | 兼容包装 | 真实测试实现位于 `tools/test/**`，`scripts/` 仅保留薄包装。 |

## 维护规则

1. 前端页面、样式、浏览器脚本只改 `src/client/**`。
2. 服务端运行时代码只改 `src/server/**`。
3. 战斗引擎只改 `src/core/battle-engine/**`。
4. 内容实体只改 `src/content/entities/**`。
5. `server/**` 仅保留兼容 shim，不允许放真实实现。
6. `public/` 只保留静态资源目录，不允许再放运行时 HTML、CSS、JS。
7. `scripts/test_*.js` 可以继续作为包装入口存在，但真实测试逻辑必须维护在 `tools/test/**`。

## 运行时映射

- `GET /` -> `src/client/index.html`
- `GET /battle.html` -> `src/client/battle.html`
- `GET /replays.html` -> `src/client/replays.html`
- `GET /workshop.html` -> `src/client/workshop.html`
- `GET /shared/*` -> `src/core/shared/*`
- `GET /portraits/*` -> `public/portraits/*`
- `GET /picture/*` -> `picture/*`

## 审计命令

```bash
npm run audit:paths
npm run audit:portable
```

- `audit:paths` 用于检查主仓库路径真相、兼容层和旧路径残留。
- `audit:portable` 用于检查 `release/GPP-Windows-Portable/` 是否与当前目录结构一致。
