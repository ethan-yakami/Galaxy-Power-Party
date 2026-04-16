# Galaxy Power Party 改进建议评审文档

更新时间：2026-04-13  
评审目标：基于当前代码现状，给出可执行、可验收、可分期的改进方案，便于你逐条批阅取舍。

---

## 1. 当前项目状态（我对代码的理解）

### 1.1 技术现状

- 服务端：`Node.js + Express + ws`，入口为 `server.js`。
- 前端：纯 `Vanilla JS`，模块通过 `window.GPP` 共享状态。
- 对战：存在双轨逻辑  
- `legacy` 轨：`server/handlers.js` + `server/skills.js` 等传统流程  
- `pure` 轨：`server/battle-engine/*` 引擎化流程，再投影给旧 UI 协议
- 房间与会话：有断线重连、在线状态、宽限期、自动托管动作。
- 扩展能力：支持自定义角色（`workshop` + `registry` + `skillRegistry`）。
- 测试：有引擎测试脚本 `tools/test/test_battle_engine.js`，覆盖已不错，但还非体系化 CI。

### 1.2 你项目已经做得很好的点（建议保留）

- 引入了 `battle-engine` 并且与 legacy 做了兼容对照，这条路线非常正确。
- 自定义角色管线完整（前端编辑 -> 服务端校验 -> 注册）。
- 重连和离线自动行动体验在轻量实时对战里很实用。
- `room_state` + effect event 的前端动画队列已经形成清晰模型。

---

## 2. 总体改进方向（先给结论）

建议把后续优化按三条主线推进：

1. **架构收口**：逐步从 legacy 收敛到 pure 引擎，减少“双实现”维护成本。  
2. **协议与可观测性**：把 WS 消息做成“有版本/有错误码/有序号”的稳定协议。  
3. **工程化补齐**：测试分层、日志分层、发布分层，让后续迭代更稳。

---

## 3. 分优先级改进清单（可直接批注）

## P0（建议优先，1-2 周可见收益）

### P0-1 收敛双轨逻辑，建立“单一事实来源”

**现状问题**

- `server/handlers.js` 同时维护 legacy 与 pure 流程，逻辑跨度极大。
- 同一个机制在 legacy / pure 可能出现行为偏差，长期回归成本高。

**影响**

- 新机制上线时要改两处，容易漏改。
- 线上偶发“同输入不同结果”时难定位。

**建议**

- 设立开关目标：默认 pure，legacy 仅用于过渡回归。
- 把 legacy 端作为“兼容投影层”，不再新增机制逻辑。
- 新功能只进 `server/battle-engine/rules/*`。

**涉及文件**

- `server/handlers.js`
- `server/skills.js`
- `server/battle-engine/*`

**验收标准**

- 新增一个机制时，`legacy` 不需要改规则代码。
- 相同随机种子下，核心结算只由 pure 引擎决定。

---

### P0-2 统一消息协议（强约束 + 错误码）

**现状问题**

- 目前消息 `type` + payload 主要靠运行时判断，缺少集中 schema。
- `error` 消息多为自然语言，前端无法稳定处理。

**影响**

- 客户端分支越来越多，兼容成本上升。
- 协议演进时容易破坏旧客户端。

**建议**

- 新建 `server/protocol/`：维护消息 schema（至少 JS 常量 + 校验函数）。
- 定义统一错误码，例如：`ROOM_NOT_FOUND`、`INVALID_SELECTION`、`NOT_YOUR_TURN`。
- `error` 结构统一为：

```json
{
  "type": "error",
  "code": "INVALID_SELECTION",
  "message": "选择数量不正确",
  "requestId": "optional"
}
```

**涉及文件**

- `server.js`
- `server/handlers.js`
- `src/client/js/connection.js`
- `src/client/js/render.js`

**验收标准**

- 前后端不再依赖模糊文本判断错误分支。
- 协议文档能覆盖所有 `type`。

---

### P0-3 拆分巨型 handler，按消息域分模块

**现状问题**

- `server/handlers.js` 承担了连接生命周期、房间管理、战斗流程、AI调度、断线托管等多职责。

**影响**

- 任意改动都可能引发连锁回归。
- 新人接手阅读门槛高。

**建议**

- 先按职责拆分，不改行为：
- `handlers/room-lifecycle.js`
- `handlers/lobby-actions.js`
- `handlers/combat-actions.js`
- `handlers/session-reconnect.js`
- `handlers/ai-offline.js`
- 在 `createHandlers` 内做组装和依赖注入。

**涉及文件**

- `server/handlers.js`（重构主战场）

**验收标准**

- 单文件控制在可读范围（例如 < 500 行作为软目标）。
- 每个模块有单一职责和导出边界。

---

### P0-4 增加“可回放快照”能力（调试和复盘价值极高）

**现状问题**

- 当前有日志和 effect 事件，但缺少标准化“对局快照文件”。

**影响**

- bug 难复现，平衡调参难量化。

**建议**

- 在 pure 引擎路径输出：
- 初始配置（角色、曙彩、seed）
- 动作序列（opcode 或语义动作）
- 关键状态快照（按回合或阶段）
- 增加导出下载与导入重放（先 debug 用，不必做复杂 UI）。

**涉及文件**

- `server/battle-engine/state.js`
- `server/battle-engine/reducer.js`
- `src/client/js/render.js`（导出入口）

**验收标准**

- 任意一局可导出 JSON，导入后结果一致（胜负、关键数值一致）。

---

### P0-5 把连接与会话状态机显式化

**现状问题**

- `src/client/js/connection.js` 已经有很多状态标记，但状态转移仍较分散。

**影响**

- 边界场景（欢迎包超时、重连中点击操作）容易出现竞态。

**建议**

- 抽出 `connectionStateMachine`（纯函数 + transition 表）。
- 所有 UI 按状态渲染，不直接依赖零散 flag。

**涉及文件**

- `src/client/js/connection.js`
- `src/client/js/state.js`

**验收标准**

- 能列出状态图并与代码一一对应。
- 关键竞态问题（重复连接、重复入房）明显减少。

---

## P1（中期，2-4 周）

### P1-1 前端模块化重整（保持 Vanilla，不强行上框架）

**现状问题**

- `render.js` 体量大、DOM 构建逻辑复杂，混合业务规则与视图细节。

**建议**

- 拆出视图子模块：
- `views/lobbyView.js`
- `views/battleView.js`
- `views/playerCard.js`
- `views/logDrawer.js`
- 把格式化逻辑（文本、标签、状态行）迁到 `formatters/`。

**验收标准**

- `render.js` 只做编排，不做具体组件细节。

---

### P1-2 建立前后端共享常量层

**现状问题**

- phase/type 等常量在不同文件重复定义，存在拼写风险。

**建议**

- 新增 `shared/constants.js`（或 `shared/protocol.js`），服务端和前端共同引用。

**涉及文件**

- `server/battle-engine/constants.js`
- `src/client/js/*`

**验收标准**

- 消息类型、阶段枚举只维护一份来源。

---

### P1-3 测试体系分层（单元/契约/端到端）

**现状问题**

- 目前测试主要集中于引擎脚本，缺少协议契约测试和连接流程测试。

**建议**

- 引擎单测：保留并继续扩展 `tools/test/test_battle_engine.js` 里的机制用例。
- 协议契约测试：模拟 ws 收发，校验 message schema 与错误码。
- 场景测试：最少覆盖“创建房间->选择->对战->结束->再来一局”。

**验收标准**

- 每次改协议会触发契约测试。
- 至少一条自动化场景覆盖断线恢复。

---

### P1-4 自定义角色持久化的并发安全

**现状问题**

- 自定义角色写入 JSON 文件，未来并发写入有覆盖风险。

**建议**

- 写入采用原子策略：写临时文件后 rename。
- 增加版本号或最后更新时间，避免误覆盖。

**涉及文件**

- `server/registry.js`

**验收标准**

- 并发提交变体时不出现丢数据。

---

### P1-5 结构化日志与问题定位信息

**现状问题**

- 当前日志可读但不够结构化，不利于聚合分析。

**建议**

- 关键路径日志统一字段：`roomCode`、`playerId`、`phase`、`action`、`requestId`。
- 错误日志带堆栈和输入摘要（注意脱敏）。

**涉及文件**

- `server.js`
- `server/handlers.js`

**验收标准**

- 线上一条错误日志能快速定位到一次具体动作。

---

## P2（中长期，4-8 周）

### P2-1 轻量持久化对局记录（可选 SQLite）

**目标**

- 支持历史对局列表、复盘入口、赛后分析。

**建议**

- 最小实现：存 `match_meta` + `replay_json`。
- 先本地 SQLite，后续再抽象为 DB 适配层。

---

### P2-2 AI 策略抽象为 policy 接口

**现状问题**

- `server/ai.js` 里已有不错策略，但与当前房间/handler耦合仍偏紧。

**建议**

- 定义 `policy(state, actions)` 接口，可切换：
- 规则启发式
- 蒙特卡洛 rollout（你已有 `simulation.js` 基础）
- 未来模型策略

**验收标准**

- AI 策略可独立替换，不改房间逻辑。

---

### P2-3 观战与隐私能力完善

**建议**

- 房间增加 `watchable/private` 选项（借鉴平台化思路）。
- 观战时限制敏感信息暴露（如手牌/未公开内容，若未来引入）。

---

## 4. 具体重构建议（按目录）

### 4.1 `server.js`

- 改进点：
- message 分发建议改为路由表，避免超长 `switch`。
- 将错误恢复策略统一（业务错误 vs 系统错误）。
- 增加服务级健康状态输出（启动配置、模式、版本）。

### 4.2 `server/handlers.js`

- 改进点：
- 将“入房、选人、战斗动作、重连、离线托管、AI调度”拆域。
- 把纯规则判断全部下沉到 `battle-engine`。
- room 的 mutable 字段做集中初始化函数，避免散落赋值。

### 4.3 `server/battle-engine/*`

- 改进点：
- 保持 TypedArray 优势，但补充更清晰的状态注释文档。
- 为每个 opcode 写“前置条件/后置条件”说明，减少误用。
- 增加属性测试（随机动作序列下不崩溃、状态不越界）。

### 4.4 `src/client/js/connection.js`

- 改进点：
- 引入显式状态机。
- 所有 socket 回调只做“事件入队”，避免直接做大量副作用。
- 统一 watchdog/timer 管理，避免重复计时器悬挂。

### 4.5 `src/client/js/render.js`

- 改进点：
- 把 `format`、`compute`、`view` 拆开。
- 减少巨型函数，逐步组件化（仍可保持原生 DOM）。
- 让渲染逻辑完全依赖 `state`，减少隐式副作用。

### 4.6 `server/registry.js` + `server/skillRegistry.js`

- 改进点：
- skill trigger 参数结构统一并文档化。
- 角色定义 schema 化，启动时严格校验并输出报告。

---

## 5. 建议里程碑（便于你审批）

### 里程碑 M1（1 周）

- 完成协议错误码统一。
- `handlers.js` 拆成 2-3 个模块（先不追求全部拆完）。
- 新增 replay JSON 导出（服务端）。

### 里程碑 M2（2-3 周）

- 前端连接状态机抽离。
- 完成至少 20 条 pure 引擎机制回归测试。
- 新机制不再进入 legacy 逻辑。

### 里程碑 M3（4-6 周）

- 引擎成为唯一规则事实来源。
- 支持导入 replay 并复现结果。
- 日志结构化，能做基础问题追踪。

---

## 6. 风险与取舍建议

### 6.1 最大风险

- 一次性大改 `handlers.js` 容易引入行为回归。

### 6.2 建议策略

- 每次只做“小步重构 + 回归测试 + 可回滚”。
- 先“移动代码不改逻辑”，再逐步逻辑收敛。

### 6.3 不建议当前阶段做的事

- 不建议马上整体迁移到前端框架（React/Vue）  
原因：短期收益小，反而打断核心玩法迭代。

---

## 7. 你可以直接批阅的决策点

请你按下面 7 项给“同意/暂缓/否决”：

1. 是否确认“pure 引擎作为长期唯一规则来源”？
2. 是否确认先做“协议错误码 + schema”？
3. 是否确认优先拆 `handlers.js`（先职责拆分）？
4. 是否确认先做 replay 导出导入（debug 能力）？
5. 是否确认前端先做状态机化，不做框架迁移？
6. 是否确认引入分层测试（引擎/协议/场景）？
7. 是否确认自定义角色持久化先做原子写入？

---

## 8. 附：推荐第一批落地任务（可直接开工）

- `T1`：新增 `server/protocol/errors.js` 和 `server/protocol/messages.js`。
- `T2`：将 `handlers.js` 拆出 `combat-actions.js`。
- `T3`：在 pure 引擎路径输出 `replay`（含 seed + action list）。
- `T4`：新增 `tools/test/test_protocol.js`（消息契约）。
- `T5`：新增 `docs/protocol.md`（消息与错误码说明）。

---

如果你批阅后确定优先级，我可以直接按你的审批结果开始改第一批代码。
