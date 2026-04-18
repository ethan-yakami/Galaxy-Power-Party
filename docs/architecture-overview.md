# 架构总览

## 当前目标

本仓库保持单仓单包，但工程结构按“轻量 monorepo”思路治理：

- `src/core/**`：纯规则、共享 schema、回放与协议定义
- `src/server/**`：Express/WebSocket 运行时、房间、协议、AI、日志
- `src/client/**`：页面、客户端壳层、浏览器交互与渲染
- `src/content/entities/**`：角色、光环骰、天气和自定义内容定义
- `tools/**`：审计、测试、构建、协议生成

## 前端壳层

battle 页现在采用“**单入口模块 + 兼容桥**”：

- `src/client/app/battle-entry.js` 是 battle 页唯一 HTML 入口
- `src/client/app/create-battle-app.js` 负责创建 app context
- `window.GPP` 只作为旧运行时兼容桥，不再是主状态源
- 当前 `src/client/js/*.js` 由 `load-battle-runtime.js` 统一装载

这一步的目标不是一次性重写所有旧渲染代码，而是先把 HTML 顺序依赖收口到单入口壳层里。

## 工程硬约束

- `tsconfig.json` 使用 `allowJs + checkJs + noEmit`
- `eslint.config.mjs` 负责新壳层、协议和工具脚本的静态检查
- `dependency-cruiser.cjs` 负责模块边界与循环依赖检查
- CI 会串联编码、lint、typecheck、depcruise、协议检查和测试
