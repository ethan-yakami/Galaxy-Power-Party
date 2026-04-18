# 仓库维护总手册 / Repository Maintenance Handbook

> Status: Active
> Audience: 所有 AI、贡献者、维护者 / All AI agents, contributors, and maintainers
> Must Read Before: 任何代码、文档、测试、构建脚本、兼容层、发布副本改动；任何构建、打包、发布前检查
> Update When: 路径迁移、入口变更、协议或回放版本变更、兼容层新增/删除、发布流程变更、文档维护规则变更
> Last Verified Against Code: 2026-04-18
> Related Checks: `npm run audit:docs`, `npm run audit:paths`, `npm run audit:boundaries`, `npm run audit:encoding`

本手册是这个仓库的唯一维护入口。任何 AI 或贡献者在改动前，都应先读这份手册，再读对应附表：

- [`./path-truth-table.md`](./path-truth-table.md)：判断某个路径属于当前源码、兼容层、派生产物还是归档资料。
- [`./module-manual.md`](./module-manual.md)：判断某个功能由谁负责，先去哪里看，哪些地方不要先改。

## 1. 先读再改 / Read Before Change

开始任何改动前，按下面顺序执行：

1. 先用本手册确认这次改动的目标、成功标准和最少验证方式。
2. 再用 [`./path-truth-table.md`](./path-truth-table.md) 判断目标路径属于哪种状态。
3. 再用 [`./module-manual.md`](./module-manual.md) 判断真实负责目录和首个排查入口。
4. 如果涉及协议、回放、部署或专项机制，再补读对应专题文档。
5. 如果仍然有歧义，先写明假设或提问，不要默默选一个版本继续改。

任何 AI 在以下场景都不能跳过这一步：

- 改代码前
- 改路径或文件位置前
- 改协议、回放、兼容层前
- 改构建、发布、便携版副本前
- 编译、打包、发布前做最后检查前

## 2. 四条开发原则 / Four Working Principles

### 2.1 Think Before Coding / 编码前思考

触发条件：

- 看到多版本目录、旧路径、兼容层、同名文件共存
- 一个需求可能落到多个目录
- 不确定哪个文件才会真正生效

必须执行：

- 明确写出假设；不确定时先问，不要猜
- 有两种以上解释时，把候选解释摊开说，不要默默选一种
- 如果有更简单的实现路径，要明确指出
- 如果不知道该改哪一层，先停下查附表

失败示例：

- 想改服务端行为，却直接去改 `server/**`
- battle 页启动问题，默默去改 `src/client/js/**`，却没先确认是不是壳层问题

### 2.2 Simplicity First / 优先考虑简洁性

触发条件：

- 想加抽象、开关、配置、通用层
- 想为未来可能出现的需求“顺手”多做一点

必须执行：

- 只写满足当前需求的最少代码和最少文档
- 单次使用逻辑不要强行抽象
- 没被要求的配置项、开关、错误分支不要提前加
- 如果 200 行能压到 50 行，就优先简化

失败示例：

- 只为一个页面修 bug，却顺手引入一整层配置系统
- 只需要一条说明，却写出一大套未来计划和未使用规则

### 2.3 Surgical Changes / 手术性修改

触发条件：

- 编辑已有文件
- 清理旧代码、旧文档、旧目录时

必须执行：

- 只动与本次需求直接相关的行
- 只清理因为这次改动而变成无用的导入、变量、函数
- 发现无关死代码时先记录，不擅自大清理
- 保持已有风格，除非本次需求明确要求统一重构

失败示例：

- 修一处文案，却顺手重排整个文件格式
- 发现旧目录就整片删除，但这次需求并没有要求清理历史兼容层

### 2.4 Goal-Driven Execution / 目标驱动执行

触发条件：

- 任何功能、修复、重构、文档维护任务

必须执行：

- 先定义“改完以后如何算成功”
- 为每一步配一个可验证检查
- 能写自动检查就优先写自动检查
- 不要用“应该可以了”代替验证

失败示例：

- 说“修好了路径问题”，但没有跑 `audit:paths`
- 说“文档同步了”，但没有检查入口链接、元数据和 PR 模板

## 3. 版本与状态模型 / Version-State Model

本仓库不优先按 `v1/v2/v3` 的时间线维护，而优先按“维护视角的状态”维护：

| 状态 | 英文名 | 意义 | 是否应作为首选修改目标 |
| --- | --- | --- | --- |
| 当前源码 | `Current Runtime Source` | 当前真实生效的代码、页面、样式、协议定义、工具源 | 是 |
| 兼容层 | `Compat Layer` | 为旧 import、旧路径、旧运行时桥接保留的薄层 | 通常否，只在维护兼容行为时改 |
| 派生产物 | `Derived Release Copy` | 从当前源码生成或复制出来的发布副本、便携包、构建输出 | 否，应先改源再重建 |
| 归档资料 | `Archive / Reference` | 历史分析、参考实现、对照仓库、一次性说明 | 否，不会直接影响当前运行 |

如果一处改动无法先判断属于哪一类，请先去查 [`./path-truth-table.md`](./path-truth-table.md)。

## 4. 快速路由 / Where To Change What

| 你要改什么 | 先看哪里 | 不要先改哪里 | 最少验证 |
| --- | --- | --- | --- |
| battle 页 HTML 结构、启动入口、壳层路由 | `src/client/battle.html`、`src/client/app/**` | `public/**`、`release/**` | `npm run test:client` |
| battle 页已启动后的渲染、交互、Socket 行为 | `src/client/js/**` | `server/**` compat shim | `npm run test:client` |
| 启动页到战斗页的壳层切换、iframe 预热、入房 intent | `src/client/app/launcher-entry.js`、`src/client/app/create-launcher-battle-shell.js` | 旧 HTML script 顺序做法 | `npm run test:client` |
| 服务端房间、消息路由、HTTP / WebSocket 入口 | `src/server/**` | `server/**` | `npm run test:node` |
| 战斗规则、结算、投影 | `src/core/battle-engine/**` | `server/battle-engine/**` | `npm run test:node` |
| 角色、曜彩、天气、自定义内容 | `src/content/entities/**` | 旧实体兼容目录、`release/**` | `npm run test:node` |
| 协议 schema、协议产物 | `src/core/shared/protocol/**`、`docs/protocol-overview.md` | 手改生成产物而不改 schema | `npm run protocol:check` |
| 回放 schema、迁移规则 | `src/core/shared/replay-schema.js`、`src/client/js/replay-history.js`、`docs/replay-format-and-migration.md` | 只改历史数据样本 | 相关 Node/Vitest 回放测试 |
| 路径边界、兼容层、目录真相 | `docs/path-truth-table.md`、`tools/dev/audit_paths.js`、`tools/dev/audit_boundaries.js` | 只改说明不加检查 | `npm run audit:docs && npm run audit:paths && npm run audit:boundaries` |
| 便携版、发布副本、打包流程 | `tools/build/**`、`release/**` 相关说明 | 直接把 `release/GPP-Windows-Portable/**` 当主源码 | `npm run audit:portable`，必要时运行便携打包 |

## 5. 最少验证矩阵 / Minimum Verification Matrix

下表定义“至少要跑什么”。如果改动跨多个区域，合并执行；如果拿不准，直接跑 `npm test`。

| 改动范围 | 至少运行 |
| --- | --- |
| 只改总手册、附表、PR 模板、贡献流程、文档审计 | `npm run audit:docs`、`npm run audit:encoding` |
| 改 `src/client/**` | `npm run test:client` |
| 改 `src/server/**` 或 `src/core/**` | `npm run test:node` |
| 改协议 schema / 协议生成链路 | `npm run protocol:check`、相关协议测试 |
| 改回放格式、回放导入导出 | 回放相关 Node/Vitest 测试 |
| 改路径边界、compat shim、目录规则 | `npm run audit:docs`、`npm run audit:paths`、`npm run audit:boundaries` |
| 改便携版或发布副本规则 | `npm run audit:portable`，必要时补运行打包脚本 |
| 改 `.github/workflows/**`、`package.json`、测试总入口 | `npm test` |

## 6. 文档维护制度 / Documentation Maintenance Rules

出现以下变更时，文档必须与代码同一个改动一起更新：

- 路径迁移、目录职责变更、入口文件变更
- `Current Runtime Source` / `Compat Layer` / `Derived Release Copy` / `Archive` 状态变化
- 协议版本、回放版本、兼容策略变化
- 新增或删除 compat shim
- 打包、部署、发布流程变化
- “最少验证矩阵”变化

以下情况可以不改版本附表，但必须在提交说明、PR 描述或最终总结里写清楚“为什么不需要更新文档”：

- 只改具体业务实现，没有改变入口、路径边界、职责归属、协议契约、版本兼容策略

发现旧代码、旧路径、旧文档时，遵守下面规则：

- 先记录，再决定
- 不因为“看起来旧”就整片删除
- 如果只是发现遗留风险，优先在说明中标记，而不是借题发挥做大清理

## 7. AI 改动记录要求 / AI Change Record

任何 AI 在完成改动后，至少要能回答下面 4 件事：

1. 假设是什么：本次有哪些默认前提，哪些地方没有完全确认。
2. 触达范围是什么：改了哪些代码、文档、脚本、流程入口。
3. 如何验证：跑了哪些检查，哪些没跑。
4. 留下了什么：发现了哪些未处理遗留问题、旧路径或派生产物漂移。

如果这次不更新文档，也要回答：

- 哪些文档本来可能受影响
- 为什么本次变化没有改变它们的事实描述

## 8. 构建、测试、发布前检查 / Build, Test, Release Checks

在构建、打包、发布前，至少确认：

- 已重新阅读本手册与相关附表
- 没有把 compat 层、派生产物、归档目录当主源码修改
- 该更新的文档已经更新
- 对应最少验证已经跑过
- 发现的 release 副本漂移是否已经说明清楚

## 9. 附表导航 / Appendix Index

- [`./path-truth-table.md`](./path-truth-table.md)：路径和目录状态附表，回答“改这里会不会生效”。
- [`./module-manual.md`](./module-manual.md)：模块职责附表，回答“这个功能究竟归谁负责”。
- [`./workspace-boundaries.md`](./workspace-boundaries.md)：工作区边界规则与审计门禁。
- [`./protocol-overview.md`](./protocol-overview.md)：协议说明。
- [`./replay-format-and-migration.md`](./replay-format-and-migration.md)：回放格式与迁移说明。
## Production Frontend Rule

- Production must serve `build/client/**`, not `src/client/**`.
- If `NODE_ENV=production` and `build/client/index.html` or hashed `assets/*.js` entries are missing, startup must fail.
- Before redeploy validation, check `/api/version`, `/api/readyz`, and `/api/frontend-diagnostics`.
- If the homepage HTML still references `app/launcher-entry.js`, treat it as a deployment regression and stop release verification.
