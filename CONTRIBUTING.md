# 贡献规范

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

## 文件与编码

- 正式文本文件统一使用 UTF-8（无 BOM）。
- 临时日志、pid、调试输出放到 `tmp/runtime/`，不要重新写回仓库根目录。
- 分析稿、评审稿和一次性说明文档统一放 `docs/archive/analysis/`。

## 测试要求

- 提交前至少运行 `npm test`。
- 如果改了 battle 页壳层、协议、回放或边界规则，额外运行对应 Vitest / Node 测试并在 PR 里写清楚。
