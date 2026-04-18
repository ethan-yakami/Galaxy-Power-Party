# 路径与版本状态附表

> Status: Active
> Audience: 所有 AI、贡献者、维护者 / All AI agents, contributors, and maintainers
> Must Read Before: 判断改动路径是否真实生效；处理多版本目录、compat shim、发布副本、归档资料前
> Update When: 目录职责变化、入口变更、compat 层变化、派生产物规则变化、归档范围变化
> Last Verified Against Code: 2026-04-18
> Related Checks: `npm run audit:docs`, `npm run audit:paths`, `npm run audit:boundaries`, `npm run audit:portable`

这份附表回答一件事：你准备修改的路径，到底属于哪种状态，改了以后会不会影响当前程序。

## 使用方法

看路径时，优先判断这 5 列：

- `状态`：当前源码 / 兼容层 / 派生产物 / 归档资料
- `作用`：这个目录为什么存在
- `运行时生效`：改这里是否会直接影响当前运行
- `允许改动类型`：这里只应承载什么改动
- `常见误改风险`：新手和 AI 最容易踩的坑

## 当前源码 / Current Runtime Source

| 路径 | 状态 | 作用 | 运行时生效 | 允许改动类型 | 常见误改风险 |
| --- | --- | --- | --- | --- | --- |
| `server.js` | Current Runtime Source | 根启动入口，只负责引导 `src/server/app/bootstrap.js` | 是 | 启动链路的最小入口调整 | 把真实业务逻辑写回根入口 |
| `src/server/**` | Current Runtime Source | Express、WebSocket、房间、服务、平台层、日志 | 是 | 服务端行为、API、消息处理、平台接入 | 误去改 `server/**` 以为会生效 |
| `src/core/battle-engine/**` | Current Runtime Source | 纯战斗规则、结算、投影、模拟 | 是 | 规则、 reducer、 projector、 engine API | 在 compat 旧路径里改同名文件 |
| `src/core/shared/**` | Current Runtime Source | 协议 schema、回放 schema、共享浏览器产物源 | 是 | 协议、回放、共享 schema 与生成源 | 只改生成产物，不改源 schema |
| `src/content/entities/**` | Current Runtime Source | 角色、曜彩、天气、自定义内容定义 | 是 | 数据定义、内容扩展 | 误去找旧的 `server/entities/**` |
| `src/client/*.html` | Current Runtime Source | 启动页、战斗页、回放页、工坊页真实页面入口 | 是 | 页面结构、模块入口引用 | 去 `public/*.html` 找旧页面 |
| `src/client/*.css` | Current Runtime Source | 浏览器页面样式 | 是 | 样式调整 | 去 `public/*.css` 期待生效 |
| `src/client/app/**` | Current Runtime Source | 现代入口壳层、模块启动、壳层路由、compat bridge 安装 | 是 | 启动链路、页面壳层、runtime loader、桥接层 | 把它误当成纯“过渡文件”而不维护 |
| `src/client/js/**` | Current Runtime Source | battle/launcher/replay/workshop 的浏览器运行时逻辑 | 是 | 渲染、交互、Socket、状态、回放逻辑 | 以为这些都已废弃，从而跳去改 release 副本 |
| `public/portraits/**` | Current Runtime Source | 立绘静态资源，服务于 `/portraits/*` | 是 | 立绘资源维护 | 误把 `public/` 当整套前端源码目录 |
| `picture/**` | Current Runtime Source | 额外静态资源，服务于 `/picture/*` | 是 | 静态图片资源维护 | 在这里找页面或 JS |
| `tools/**` | Current Runtime Source | 测试、审计、打包、协议生成等工具源 | 否 | 审计脚本、测试、构建流程 | 只改文档不补工具检查，或反过来只改工具不补说明 |
| `prisma/**` | Current Runtime Source | 数据库 schema、迁移、生成配置 | 条件生效 | 持久化模型与迁移 | 把数据层改动漏掉文档和部署说明 |
| `.github/**` | Current Runtime Source | CI、PR 模板、仓库流程规则 | 否 | CI 门禁、模板、自动化流程 | 改了流程说明却没改 CI，或反过来 |

## 兼容层 / Compat Layer

| 路径 | 状态 | 作用 | 运行时生效 | 允许改动类型 | 常见误改风险 |
| --- | --- | --- | --- | --- | --- |
| `server/**` | Compat Layer | 老 import 路径兼容层，只保留 `module.exports = require(...)` | 间接生效 | re-export 指向修正、兼容性维护 | 把真实实现写回 compat shim |
| `server/battle-engine/**` | Compat Layer | 老引擎导出路径，对接到 `src/core/battle-engine/**` | 间接生效 | 兼容导出维护 | 误以为这里是主引擎实现 |
| `src/content/{dice,registry,rooms,skills,weather}.js` | Compat Layer | 老内容入口兼容导出 | 间接生效 | re-export 维护 | 直接在兼容入口里补业务逻辑 |
| `src/core/{registry,weather}.js` | Compat Layer | 老核心入口兼容导出 | 间接生效 | re-export 维护 | 把内容真相写回 compat 文件 |

## 派生产物 / Derived Release Copy

| 路径 | 状态 | 作用 | 运行时生效 | 允许改动类型 | 常见误改风险 |
| --- | --- | --- | --- | --- | --- |
| `release/GPP-Windows-Portable/**` | Derived Release Copy | Windows 便携版副本，来自主源码同步或打包 | 否，不是主源码 | 仅在确认发布产物内容、比对漂移时查看；原则上应改源后重建 | 直接修这里，开发环境却毫无变化 |
| `build/**` | Derived Release Copy | 构建输出或中间产物 | 否 | 构建结果检查 | 把构建结果当源码提交 |
| `tmp/**` | Derived Release Copy | 运行日志、临时数据、调试输出 | 否 | 临时产物与诊断数据 | 把临时结果当正式配置保存 |

## 归档资料 / Archive or Reference

| 路径 | 状态 | 作用 | 运行时生效 | 允许改动类型 | 常见误改风险 |
| --- | --- | --- | --- | --- | --- |
| `docs/archive/**` | Archive / Reference | 历史分析、一次性说明、旧评审记录 | 否 | 归档、保留历史上下文 | 把旧分析稿当当前规范 |
| `docs/reference/**` | Archive / Reference | 参考资料与专题背景 | 否 | 参考阅读 | 把参考文档当强约束来源 |
| `genius-invokation-main/**` | Archive / Reference | 外部/历史对照仓库快照 | 否 | 差异对比、借鉴 | 在这里改了却以为当前项目会跟着变 |
| `avatars_scratch/**` | Archive / Reference | 资源草稿与实验目录 | 否 | 草稿保留、素材试验 | 直接把草稿当正式资源入口 |

## 特别边界说明

| 路径 | 说明 |
| --- | --- |
| `public/**` | 只允许静态资源与说明文件；不应再承载当前运行时 HTML、CSS、JS。真正会生效的前端入口在 `src/client/**`。 |
| `public/portraits/**` | 是少数仍然属于当前运行链路的 `public` 子目录。 |
| `release/GPP-Windows-Portable/src/**` | 虽然名字里也有 `src`，但它仍然属于派生产物，不是主源码。 |
| `server/handlers_orig.js` | 历史兼容残留，只作旧副本包装，不应视为真实实现。 |

## 运行时映射

- `GET /` -> `src/client/index.html`
- `GET /battle.html` -> `src/client/battle.html`
- `GET /replays.html` -> `src/client/replays.html`
- `GET /workshop.html` -> `src/client/workshop.html`
- `GET /shared/*` -> `src/core/shared/*`
- `GET /portraits/*` -> `public/portraits/*`
- `GET /picture/*` -> `picture/*`

## 快速判断规则

1. 你改的是 `src/**`，大概率在改当前源码。
2. 你改的是 `server/**`，先确认是不是只该改 compat shim。
3. 你改的是 `release/**`，先停一下，确认是否应该改主源码后重建。
4. 你改的是 `docs/archive/**` 或 `genius-invokation-main/**`，当前程序通常不会有任何变化。
5. 你改的是 `public/**`，先确认是不是静态资源；页面和脚本不要回写到这里。

## 相关检查

```bash
npm run audit:docs
npm run audit:paths
npm run audit:boundaries
npm run audit:portable
```

- `audit:docs`：检查总手册入口、附表元数据、PR 模板和根文档链接。
- `audit:paths`：检查主仓库路径真相、兼容层和旧路径残留。
- `audit:boundaries`：检查 compat shim、`public/` 边界和单一真相源规则。
- `audit:portable`：检查便携版副本与主源码是否漂移。
