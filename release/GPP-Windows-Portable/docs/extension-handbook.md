# 扩展开发手册

## 新增角色

1. 在 `src/content/entities/characters/` 下新增角色定义
2. 按现有角色格式填写 id、name、基础属性、技能文本和规则钩子
3. 如果角色规则需要引擎配合，同步修改 `src/core/battle-engine/rules/characters.js`
4. 补 battle engine 测试和机制矩阵测试

## 新增光环骰

1. 在 `src/content/entities/auroras/` 下新增定义
2. 明确 faces、触发条件、效果文本
3. 如果效果会影响行动票据或阶段结算，同步补协议/战斗测试

## 新增天气

1. 在天气目录中补实体定义
2. 在 `src/core/battle-engine/rules/weather.js` 中补规则
3. 运行天气一致性检查和机制矩阵测试

## Custom Content / Workshop

- 自定义内容入口走当前 workshop 和 `create_custom_character` / `update_custom_character` 相关协议
- 新增可配置项时，要同步补：
  - 客户端字段校验
  - 服务端 payload 校验
  - registry 加载逻辑
  - 文档说明

## 第三方客户端 / 观战工具

- 只能依赖公开协议，不要直接依赖服务端内部模块
- 先读 `/api/version` 获取协议版本
- 统一使用 WebSocket envelope 和错误码目录
- 读回放工具优先复用 `ReplayV2`
