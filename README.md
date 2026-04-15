# 银河战力党 (Galaxy Power Party)

## 文档导航

- [Windows 下载即用说明书](./WINDOWS_下载即用说明书.md)
- [Windows 下载即用功能测试报告](./WINDOWS_下载即用功能测试报告.md)
- [引擎流程文档（phase/结算顺序/状态转移）](./docs/engine-process.md)
- [模块职责手册](./docs/module-manual.md)
- [路径真相表（运行入口 / shim / 历史镜像）](./docs/path-truth-table.md)

2 人 WebSocket 骰子对战网页游戏，Node.js + Express + 原生前端实现。

## 普通用户：Windows 下载即用（免安装）

适用场景：你只想解压后双击运行，不想安装 Node.js。

1. 下载并解压 `GPP-Windows-Portable` 发布包
2. 双击 `start_game.bat`
3. 浏览器会自动打开 `http://localhost:3000`
4. 结束时双击 `stop_game.bat`

启动后终端会显示两种地址：

- 本机地址：`http://localhost:3000`
- 局域网地址：`http://<你的IP>:3000`（同 Wi-Fi 设备可访问）

如需跨网络联机测试：

1. 先安装 `cloudflared`，或把 `cloudflared.exe` 放到项目根目录
2. 双击 `start_online.bat`
3. 终端会显示一个 `https://...trycloudflare.com` 的分享地址
4. 把这个地址发给朋友，让对方直接从这个地址打开游戏

## 开发者：源码一键启动（需要 Node.js）

适用场景：你从仓库直接运行或开发调试。

1. 安装 Node.js 18+
2. 双击 `start_dev.bat`
3. 首次会自动执行 `npm install`
4. 启动后自动打开浏览器

也可使用命令行：

```bash
npm install
npm start
```

## 可配置项

- `PORT`：监听端口，默认 `3000`
- `HOST`：监听地址，默认 `0.0.0.0`（允许局域网访问）
- `CLOUDFLARED_EXE`：可选，指定 `cloudflared.exe` 的完整路径

示例（命令行）：

```bash
set PORT=4000
set HOST=127.0.0.1
npm start
```

## 维护者：构建免安装发布包

在项目根目录执行：

```bash
npm run build:portable
npm run audit:portable
```

构建结果：

- `release/GPP-Windows-Portable/`
- `release/GPP-Windows-Portable.zip`

## 常见问题

### 1) 浏览器提示 `ERR_CONNECTION_REFUSED`

- 服务没启动成功，检查 `server_runtime.log`
- 或端口被占用，先执行 `stop_game.bat` 再启动

### 2) 提示端口 3000 被占用

- 关闭占用该端口的程序
- 或切换端口：先设置 `PORT` 再运行启动脚本

### 3) 局域网设备无法访问

- 确认两台设备在同一局域网
- Windows 防火墙弹窗要允许访问
- 启动时 `HOST` 保持默认 `0.0.0.0`（不要设为 `127.0.0.1`）

### 4) `start_online.bat` 提示找不到 `cloudflared`

- 先确认已安装 Cloudflare Tunnel 客户端
- 或把 `cloudflared.exe` 放到项目根目录
- 或先设置环境变量 `CLOUDFLARED_EXE` 再运行，例如：

```bat
set CLOUDFLARED_EXE=C:\tools\cloudflared\cloudflared.exe
start_online.bat
```

### 5) 公网链接没出来或朋友打不开

- 查看 `cloudflared.log` 是否有连接错误
- 确认本机网络未拦截 Cloudflare 连接
- Quick Tunnel 地址是临时的，重启后通常会变化，需要重新发送

## 技术栈

- Node.js
- Express
- ws (WebSocket)
- HTML / CSS / JavaScript (Vanilla)

## 当前目录结构

- src/server：服务端运行时、协议与房间装配
- src/core：纯战斗引擎与共享 schema
- src/content：角色、曜彩、天气与自定义内容实体
- src/client：多页面前端入口、样式与浏览器脚本
- public/portraits：当前仍保留的立绘静态资源
- tools：测试、构建与开发工具

## 路径维护约定

- 前端页面、样式、浏览器脚本只改 `src/client/`
- 服务端运行时代码只改 `src/server/`
- 战斗引擎只改 `src/core/battle-engine/`
- 内容实体只改 `src/content/entities/`
- `server/` 目录仅保留兼容 re-export
- `public/` 根目录不再承载前端页面或脚本，当前只保留 `portraits/`

额外校验命令：

```bash
npm run audit:paths
npm run audit:portable
```

如需核对某个 URL 或模块当前到底从哪里运行，请直接查看 [docs/path-truth-table.md](./docs/path-truth-table.md)。

