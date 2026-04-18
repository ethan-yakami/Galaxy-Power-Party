# Windows 下载即用功能测试报告

测试日期：2026-04-09  
测试环境：Windows + PowerShell，本地项目目录与便携包目录

## 测试项与结果

1. 源码目录 `start_game.bat` 启动  
结果：通过（服务启动后 `http://localhost:3000` 返回 `200`）

2. 源码目录 `stop_game.bat` 停止  
结果：通过（端口监听进程被成功停止）

3. 源码目录 `start_dev.bat` 启动  
结果：通过（服务启动后 `http://localhost:3001` 返回 `200`）

4. 便携包构建 `npm run build:portable`  
结果：通过（生成 `release/GPP-Windows-Portable` 与 `release/GPP-Windows-Portable.zip`）

5. 便携包目录 `start_game.bat` 启动  
结果：通过（服务启动后 `http://localhost:3010` 返回 `200`）

6. 便携包目录 `stop_game.bat` 停止  
结果：通过（端口监听进程被成功停止）

7. 端口占用冲突提示  
结果：通过（同端口重复启动时提示占用 PID 与处理建议）

## 结论

- “普通电脑下载后双击运行”的核心链路已可用。
- “开发者源码一键运行”链路已可用。
- 发布流程（便携包构建）可用。
