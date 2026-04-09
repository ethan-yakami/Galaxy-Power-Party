# 银河战力党 (Galaxy Power Party)

## 文档导航

- [Windows 下载即用说明书](./WINDOWS_下载即用说明书.md)
- [Windows 下载即用功能测试报告](./WINDOWS_下载即用功能测试报告.md)

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

## 技术栈

- Node.js
- Express
- ws (WebSocket)
- HTML / CSS / JavaScript (Vanilla)
