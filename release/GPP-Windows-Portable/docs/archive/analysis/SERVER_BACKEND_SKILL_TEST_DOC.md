# 服务端机制与文案一致性测试说明

本文档描述当前“服务端机制与文案一致性”测试应以哪些目录为准，以及执行时应检查哪些真实实现入口。

## 1. 代码真相来源

以下目录是当前测试与排查时的唯一真实来源：

1. `src/server/app/handlers.js`
2. `src/server/services/skills.js`
3. `src/server/services/weather.js`
4. `src/server/services/registry.js`
5. `src/server/services/rooms.js`
6. `src/server/services/dice.js`
7. `src/content/entities/characters/*.js`
8. `src/content/entities/auroras/*.js`
9. `src/content/entities/custom_characters.json`
10. `src/core/battle-engine/**`

以下目录仅用于兼容，不应再作为真实实现来源：

- `server/**`
- `server/battle-engine/**`

## 2. 文案与机制对照顺序

1. 先核对实体文案：`src/content/entities/**`
2. 再核对机制文档：`MECHANISMS_AND_TESTS.md`、`WEATHER_SYSTEM_SPEC.md`
3. 最后核对真实运行逻辑：`src/server/**` 与 `src/core/battle-engine/**`

## 3. 推荐测试入口

- `node scripts/run_backend_skill_doc_tests.js`
- `npm test`
- `npm run audit:paths`

## 4. 路径维护规则

- 若测试脚本需要引用运行逻辑，优先直接引用 `src/**` 下真实实现。
- 若测试脚本需要引用内容实体，优先直接引用 `src/content/entities/**`。
- `server/**` 仅在验证 compat shim 是否仍可用时引用，不作为默认入口。
