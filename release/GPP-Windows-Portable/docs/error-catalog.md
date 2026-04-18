# 错误码目录

## 分类

- `protocol`：协议结构或版本问题
- `user`：用户当前操作不合法
- `battle`：战斗阶段或行动票据问题
- `resume`：断线恢复失败
- `internal`：服务端内部错误

## 当前注册表

| code | category | severity | 说明 |
| --- | --- | --- | --- |
| `INVALID_JSON` | protocol | warn | 消息不是合法 JSON 或顶层结构不合法 |
| `INVALID_PAYLOAD` | protocol | warn | 消息结构通过了 JSON 解析，但字段校验失败 |
| `UNKNOWN_TYPE` | protocol | warn | 未知消息类型 |
| `ROOM_NOT_FOUND` | user | warn | 房间不存在 |
| `NOT_IN_ROOM` | user | warn | 当前连接不在房间中 |
| `NOT_YOUR_TURN` | user | warn | 非当前行动方提交了行动 |
| `INVALID_SELECTION` | user | warn | 选择内容不合法 |
| `BATTLE_NOT_ACTOR` | battle | warn | 不是当前行动者却提交了行动票据 |
| `BATTLE_STALE_TURN` | battle | warn | turnId 已过期 |
| `BATTLE_INVALID_ACTION` | battle | warn | actionId 与当前快照不匹配 |
| `BATTLE_ACTION_CONSUMED` | battle | warn | 当前行动票据已被消费 |
| `BATTLE_PROTOCOL_DEPRECATED` | protocol | warn | 仍在使用旧战斗协议 |
| `SESSION_RESUME_FAILED` | resume | warn | 断线恢复失败 |
| `UNSUPPORTED_PROTOCOL_VERSION` | protocol | error | 客户端声明的协议版本不受支持 |
| `INTERNAL_ERROR` | internal | error | 服务端内部异常 |

## 代码位置

- 共享注册表：`src/core/shared/protocol/error-registry.js`
- 服务端构造错误：`src/server/transport/protocol/errors.js`
