# 回放格式与迁移

## 当前版本

- 当前回放版本：`ReplayV2`
- 兼容输入：`ReplayV1`、`ReplayV2`
- 不支持版本：会返回 `UNSUPPORTED_REPLAY_VERSION`

## 迁移入口

- 共享 schema：`src/core/shared/replay-schema.js`
- 历史存储：`src/client/js/replay-history.js`

## 迁移规则

- 缺失 `version` 的旧回放按 `ReplayV1` 处理
- `ReplayV1` 会在导入时被规范化成 `ReplayV2`
- `ReplayV2` 保留 `stepDetails`、`snapshots`、`result` 等结构

## 回放最小骨架

```json
{
  "replayId": "replay:room:startedAt:seed:P0:P1",
  "version": "ReplayV2",
  "engineMode": "pure",
  "protocolModel": "action_ticket",
  "roomMeta": {},
  "playersLoadout": [],
  "actions": [],
  "stepDetails": [],
  "snapshots": [],
  "result": {}
}
```

## 调试建议

- 浏览器本地回放历史 key：`gpp_replay_history_v2`
- 如果导入失败，先看错误码，再看 `version`、`actions`、`snapshots` 是否缺失关键字段
