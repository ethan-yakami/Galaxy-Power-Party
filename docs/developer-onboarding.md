# 开发入门

## 环境

- Node.js 18+
- npm
- Windows 启动脚本可选，命令行同样可用

## 首次运行

```bash
npm install
npm start
```

Windows 下也可以直接运行：

- `start_dev.bat`：源码开发模式
- `start_game.bat`：便携运行模式
- `start_online.bat`：在本地服务器基础上开启 Cloudflare 隧道

运行日志与 pid 现在统一写入 `tmp/runtime/`。

## 提交前最少检查

```bash
npm test
```

如果你只改了 battle 页壳层，也建议额外执行：

```bash
npm run test:client
```

## 定位入口

- 服务端入口：[server.js](../server.js)
- 实际服务启动：[src/server/app/bootstrap.js](../src/server/app/bootstrap.js)
- battle 页入口：[src/client/battle.html](../src/client/battle.html)
- battle 页模块壳：[src/client/app/battle-entry.js](../src/client/app/battle-entry.js)

## Local Startup Contract

- `npm start` is the standard local startup path and works without running `vite build` first.
- `start_game.bat` uses the same Express static hosting path and does not require `npm run build:client`.
- `npm run build:client` is only for release/static build verification and deployment packaging.

