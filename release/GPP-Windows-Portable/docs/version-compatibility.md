# 版本兼容策略

## 协议

- 当前协议版本：`2`
- 废弃版本：`1`
- 客户端必须在 `meta.protocolVersion` 中声明版本，或由客户端壳层自动补当前版本
- 服务端只接受支持列表中的版本；不支持版本直接返回 `UNSUPPORTED_PROTOCOL_VERSION`

## 回放

- 当前回放版本：`ReplayV2`
- 允许从 `ReplayV1` 升级迁移到 `ReplayV2`
- 新增回放版本时，必须在 `src/core/shared/replay-schema.js` 中补迁移函数和测试

## 兼容清理纪律

- 兼容路径必须标记来源和清理条件
- 协议或回放版本变化必须同步更新：
  - `/api/version`
  - 对应 schema / registry
  - 协议或回放文档
  - 回归测试
