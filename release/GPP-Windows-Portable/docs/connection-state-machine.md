# battle 连接状态机（launch/auth/room_ack/reconnect）

本文描述 `src/client/js/connection.js` 与 `src/client/js/connection-state-machine.js` 的对齐关系，目标是让连接链路“可观测、可回滚、可压测”。

## 状态定义

- `idle`: 初始态，尚未发起连接。
- `connecting`: 正在创建 WebSocket。
- `awaiting_welcome`: socket 已打开，等待服务端 `welcome`。
- `resuming`: 检测到历史会话后正在 `resume_session`。
- `ready`: 连接可用，但未进入房间。
- `joining_room`: 已发出 `create/join/resume` 入房意图，等待 `room_state`。
- `in_room`: 已获得房间快照并进入房间。
- `retry_wait`: 断线后退避重连等待。
- `failed`: watchdog 或连接错误导致当前链路失败。

## 事件定义

- `APP_START` / `USER_RECONNECT`
- `SOCKET_OPEN` / `SOCKET_CLOSE` / `CONNECT_ERROR`
- `WELCOME`
- `INTENT_RETRY`
- `ROOM_STATE`
- `RESUME_OK` / `RESUME_FAIL`
- `WATCHDOG_TIMEOUT`
- `LEFT_ROOM`

## 状态流（核心链路）

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> connecting: APP_START
  connecting --> awaiting_welcome: SOCKET_OPEN
  awaiting_welcome --> resuming: WELCOME + shouldResume
  awaiting_welcome --> ready: WELCOME + noResume
  ready --> joining_room: INTENT_RETRY
  joining_room --> in_room: ROOM_STATE(inRoom=true)
  resuming --> ready: RESUME_FAIL
  resuming --> in_room: RESUME_OK + ROOM_STATE
  in_room --> ready: LEFT_ROOM
  awaiting_welcome --> failed: WATCHDOG_TIMEOUT(welcome)
  joining_room --> failed: WATCHDOG_TIMEOUT(room_ack)
  connecting --> failed: CONNECT_ERROR
  awaiting_welcome --> retry_wait: SOCKET_CLOSE
  ready --> retry_wait: SOCKET_CLOSE
  joining_room --> retry_wait: SOCKET_CLOSE
  in_room --> retry_wait: SOCKET_CLOSE
  retry_wait --> connecting: APP_START / USER_RECONNECT
```

## 实现约束

- `connection.js` 仍保持向后兼容行为；状态机接入用于统一状态语义与诊断，不改变协议字段。
- `GPP.getConnectionDiagnostics()` 暴露：
  - `machineState`
  - `machineLastEvent`
  - `launchFlow`
  - `connection`
- watchdog 只用于异常检测，不再主导正常快路径节奏。

## 回归关注点

- AI 快路径：`welcome -> INTENT_RETRY -> room_state` 不等待 `auth_state`。
- 断线恢复：`SOCKET_CLOSE -> retry_wait -> reconnect -> welcome -> resume`。
- 入房失败：`room_ack` 超时和 join 错误码必须可区分。
