# 排障手册

## 1. battle 页卡住，无法自动进房

优先检查：

1. 地址参数里是否包含 `mode=...`
2. 浏览器控制台是否有 `battle-entry` 或 `client.battle-app` 报错
3. `tmp/runtime/server_runtime.log` / `tmp/runtime/server_error.log`
4. 是否收到了 `welcome`，以及后续是否收到 `room_state`

常见原因：

- 启动参数缺失或错误
- WebSocket 连接建立了，但 `welcome` 超时
- `welcome` 成功后，自动 `create_ai_room` / `join_room` 没拿到 `room_state`

## 2. welcome 超时

- 看浏览器控制台里 `socket_connect_requested`、`socket_opened` 是否出现
- 如果出现 `socket_opened` 但没有 `welcome_received`，优先排查服务端连接处理
- 如果浏览器侧直接出现 `socket_error`，优先排查 host、端口和浏览器拦截

## 3. resume 失败

- 查看是否收到了 `session_resume_failed`
- 检查本地存储里的 reconnect token 和 roomCode 是否对应当前房间
- 查看服务端是否返回了 `SESSION_RESUME_FAILED`

## 4. 协议版本不匹配

- 打开 `/api/version`
- 确认客户端发送的 `meta.protocolVersion`
- 如果报 `UNSUPPORTED_PROTOCOL_VERSION`，说明客户端壳层或第三方工具还在用旧版本

## 5. 回放导入失败

- 先看错误码是否是 `INVALID_REPLAY_PAYLOAD` 或 `UNSUPPORTED_REPLAY_VERSION`
- 检查 `version`、`actions`、`snapshots`、`result` 是否存在
- 老回放缺 `version` 时会按 `ReplayV1` 尝试迁移

## 6. 文本乱码

- 正式文本文件必须是 UTF-8（无 BOM）
- 提交前运行 `npm run audit:encoding`
- 如果某个文件再次出现乱码，优先用编辑器重新按 UTF-8 保存，再重新运行审计
## Launcher Buttons Do Nothing

Check these items first:

1. Open `/api/version` and confirm the deployed app version matches the current repo version.
2. Open `/api/frontend-diagnostics` and confirm `servedMode` is `build-client` in production.
3. View the homepage HTML source. If it still references `app/launcher-entry.js`, the server is serving source HTML instead of the built frontend.
4. Check the browser console for `launcher-entry` or `runtime source` errors. Those errors should now identify which runtime source failed to load.
