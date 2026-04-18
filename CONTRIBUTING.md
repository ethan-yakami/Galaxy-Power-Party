# 贡献规范

## 改动前必读

- 任何 AI 或贡献者在改代码、文档、测试、构建脚本、compat shim、发布副本前，都要先读 [`docs/repo-maintenance-handbook.md`](./docs/repo-maintenance-handbook.md)。
- 再读 [`docs/path-truth-table.md`](./docs/path-truth-table.md) 判断路径状态，读 [`docs/module-manual.md`](./docs/module-manual.md) 判断职责归属。
- 如果改动影响路径、入口、协议/回放版本、compat 层、发布流程，必须在同一个改动里同步更新文档。

## 基本原则

- 运行时逻辑只改 `src/`，不要把新功能写回 compat shim。
- 前端运行时入口遵循单入口模块，不再往 HTML 里追加有顺序依赖的脚本标签。
- `src/core` 只能放纯规则、共享 schema 和不依赖服务端/浏览器的逻辑。
- `src/server` 只能放服务端运行时、房间、协议、AI、日志和 HTTP/WebSocket 接入。
- `src/client` 只能放浏览器壳、渲染、交互、页面状态和客户端适配层。

## 提交与 PR

- commit message 用一句话说明意图，推荐前缀：`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `build:`, `chore:`.
- 一个 PR 只解决一类问题；不要把玩法改动、UI 重构和工具链清理混在一起。
- PR 描述至少写清楚：背景、变更点、测试方式、风险点。
- PR 必须说明文档影响：更新了哪些文档；如果没更新，也要写明为什么不需要。

## 文件与编码

- 正式文本文件统一使用 UTF-8（无 BOM）。
- 临时日志、pid、调试输出放到 `tmp/runtime/`，不要重新写回仓库根目录。
- 分析稿、评审稿和一次性说明文档统一放 `docs/archive/analysis/`。

## 测试要求

- 提交前至少运行 `npm test`。
- 如果改了 battle 页壳层、协议、回放或边界规则，额外运行对应 Vitest / Node 测试并在 PR 里写清楚。
