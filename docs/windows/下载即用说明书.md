# 银河战力党 Windows 下载即用说明书

## 1. 这份说明书适用谁

- 普通玩家：不想装 Node.js，只想下载后双击运行
- 开发者：从源码仓库直接启动并调试

## 2. 普通玩家（免安装）使用步骤

1. 下载并解压 `GPP-Windows-Portable.zip`
2. 进入解压目录，双击 `start_game.bat`
3. 浏览器会自动打开：`http://localhost:3000`
4. 对战结束后，双击 `stop_game.bat` 关闭服务

说明：
- 启动后终端会显示本机地址和局域网地址
- 局域网地址可给同一 Wi-Fi 下的朋友联机访问

## 3. 开发者（源码）使用步骤

1. 安装 Node.js 18+
2. 在项目根目录双击 `start_dev.bat`
3. 首次会自动安装依赖并启动服务
4. 结束时双击 `stop_game.bat`

可选命令行方式：

```bash
npm install
npm start
```

## 4. 端口和网络配置

- 默认端口：`3000`
- 默认监听：`0.0.0.0`（允许局域网访问）

修改端口示例（先设置再启动）：

```bat
set PORT=3005
start_game.bat
```

仅允许本机访问示例：

```bat
set HOST=127.0.0.1
start_game.bat
```

## 5. 常见问题排查

### 5.1 `ERR_CONNECTION_REFUSED`

- 先确认是否已运行 `start_game.bat`
- 查看同目录 `server_runtime.log` 和 `server_error.log`
- 若服务异常，先执行 `stop_game.bat` 再重新启动

### 5.2 提示端口被占用

- 说明已有进程占用该端口
- 先执行 `stop_game.bat`
- 或换一个端口（例如 `PORT=3005`）

### 5.3 局域网设备打不开

- 两台设备需在同一局域网
- Windows 防火墙弹窗请选择“允许访问”
- 启动时不要把 `HOST` 设成 `127.0.0.1`

## 6. 发布给别人（维护者）

在项目根目录执行：

```bash
npm run build:portable
```

产物目录：
- `release/GPP-Windows-Portable/`
- `release/GPP-Windows-Portable.zip`

推荐直接发送 zip 给普通玩家，解压后双击即可运行。
