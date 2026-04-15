# 模块职责手册

这份手册按“功能由谁负责”来整理仓库，方便排查问题时快速找到真实实现目录。

## 1. 总体分层

- `src/server/**`：服务端运行时、协议、房间、AI、服务装配。
- `src/core/battle-engine/**`：纯战斗引擎，负责规则与结算。
- `src/content/entities/**`：角色、曜彩、自定义内容实体。
- `src/client/**`：前端页面、样式、浏览器脚本。
- `src/core/shared/**`：共享浏览器 schema，通过 `/shared/*` 暴露。
- `server/**`：兼容 shim，不承载真实实现。
- `public/portraits/**`、`picture/**`：保留静态资源。

## 2. 启动入口

- [server.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/server.js)：根启动入口。
- [bootstrap.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/server/app/bootstrap.js)：真实服务端启动入口。
- [index.html](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/index.html)、[battle.html](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/battle.html)、[replays.html](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/replays.html)、[workshop.html](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/workshop.html)：前端页面入口。

## 3. 服务端职责

- [handlers.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/server/app/handlers.js)：房间生命周期、选角、开局、动作转换。
- [message-router.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/server/transport/message-router.js)：WebSocket 消息分发。
- [rooms.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/server/services/rooms.js)：房间同步与广播工具。
- [registry.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/server/services/registry.js)：实体注册与自定义内容加载。
- [weather.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/server/services/weather.js)：天气目录与兼容服务层。
- [replay.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/server/services/replay.js)：回放导出与重建。
- [ai/index.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/server/ai/index.js)：AI 玩家生成和行动选择。

## 4. 引擎职责

- [index.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/core/battle-engine/index.js)：引擎公共 API。
- [state.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/core/battle-engine/state.js)：战斗状态结构与初始化。
- [reducer.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/core/battle-engine/reducer.js)：主结算器。
- [projector.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/core/battle-engine/projector.js)：将纯状态映射为旧协议房间快照。
- [rules/characters.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/core/battle-engine/rules/characters.js)、[rules/auroras.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/core/battle-engine/rules/auroras.js)、[rules/weather.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/core/battle-engine/rules/weather.js)：角色、曜彩、天气规则表。

## 5. 客户端职责

- [state.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/js/state.js)：全局状态与 DOM 引用。
- [connection.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/js/connection.js)：WebSocket 连接与消息接收。
- [render.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/js/render.js)：主渲染流程。
- 历史上的 `public/js/render.js` 仅作为旧路径说明，不再是当前运行时源码。
- [dice-ui.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/js/dice-ui.js)：骰子交互。
- [ui.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/js/ui.js)：弹层和 UI 工具。
- [effects.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/js/effects.js)：伤害、治疗和特效动画。
- [workshop.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/js/workshop.js)：工坊逻辑。
- [replays.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/js/replays.js)、[replay-history.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/src/client/js/replay-history.js)：回放与历史记录。

## 6. 测试与工具

- [tools/test/test_battle_engine.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/tools/test/test_battle_engine.js)：战斗引擎测试入口。
- [tools/test/test_protocol.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/tools/test/test_protocol.js)：协议测试入口。
- [tools/test/test_connection_state_machine.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/tools/test/test_connection_state_machine.js)：连接状态机测试入口。
- [tools/test/test_replay_history.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/tools/test/test_replay_history.js)：回放历史测试入口。
- [tools/build/build_portable.ps1](/C:/Users/user/Desktop/Galaxy-Power-Party-master/tools/build/build_portable.ps1)：Windows portable 包构建脚本。
- [tools/dev/audit_paths.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/tools/dev/audit_paths.js)、[tools/dev/audit_portable.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/tools/dev/audit_portable.js)：路径与发布产物审计。

## 7. 定位建议

- “战斗规则不对”：先看 `src/core/battle-engine/**`。
- “角色或曜彩定义不对”：先看 `src/content/entities/**`。
- “房间同步或协议异常”：先看 `src/server/**`。
- “界面显示不对但服务端状态正确”：先看 `src/client/**` 和 `src/core/battle-engine/projector.js`。
- “修改了 `server/**` 却没生效”：检查是否误改了 compat shim，而不是真实实现。
