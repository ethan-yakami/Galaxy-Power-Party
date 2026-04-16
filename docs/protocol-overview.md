# 协议总览

## 传输模型

WebSocket 继续使用 JSON envelope：

```json
{
  "type": "join_room",
  "payload": { "name": "Alice", "code": "1234" },
  "meta": { "requestId": "battle-1", "protocolVersion": "2" }
}
```

兼容旧消息格式时，顶层字段仍会被收敛进 `payload`。

## 版本规则

- 当前协议版本：`2`
- 支持版本列表：见 `/api/version`
- 废弃版本列表：见 `/api/version`
- 客户端如果携带了不支持的 `meta.protocolVersion`，服务端会返回 `UNSUPPORTED_PROTOCOL_VERSION`

## 错误响应

错误响应统一为：

```json
{
  "type": "error",
  "code": "INVALID_PAYLOAD",
  "message": "Invalid message payload.",
  "severity": "warn",
  "category": "protocol",
  "meta": { "requestId": "battle-1", "protocolVersion": "2" }
}
```

详细错误码表见：[error-catalog.md](./error-catalog.md)

## 协议真相来源

- 源头 schema：`src/core/shared/protocol/schema.js`
- 共享错误码：`src/core/shared/protocol/error-registry.js`
- 版本规则：`src/core/shared/protocol/versioning.js`
- 生成产物：`proto/gpp-battle.proto`、`src/core/shared/generated/*`
