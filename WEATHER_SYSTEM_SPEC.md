# 天气系统机制规范（已实现版）

本文件定义当前已实装的天气机制规范与测试基线，用于约束后续迭代与回归验证。

## 1. 目标与边界

- 目标：通过天气系统缓和先手天然优势，并保持与现有角色/曜彩/骰子机制复用。
- 边界：当前前后端与 WebSocket 协议均已接入天气系统；本文件用于说明现状与后续约束。
- 原则：
  - 优先复用已有状态字段与结算流程，不引入平行底层系统。
  - 天气属于“外层环境修正”，不复制角色技能或曜彩 A 效果实现。
  - 截图不可辨识文案以 `TODO(待确认文案)` 标注，并附推荐映射。

## 2. 固定轮换规则（2/4/6/8）

### 2.1 回合与阶段

- 第 1 回合：无天气（`weather = null`）。
- 第 2 回合起：仅在回合 `2/4/6/8` 进入前切换天气。
- 阶段持续：
  - `Round 2` 阶段覆盖回合 2-3
  - `Round 4` 阶段覆盖回合 4-5
  - `Round 6` 阶段覆盖回合 6-7
  - `Round 8` 阶段覆盖回合 8 及之后（直到对局结束）

### 2.2 切换时机

- 切换触发点：后手方回合开始前（对应现有 `goNextRound` 中回合推进时机）。
- 第 1 回合不触发天气切换。
- 每次进入新阶段，从该阶段候选池随机 1 个天气生效，并向双方广播。

### 2.3 选择策略

- 策略：候选池随机 1 个（`uniform random`）。
- 要求：同一房间内双方看到的当前天气必须一致（服务端权威）。

## 3. 天气生命周期与结算插槽

天气统一抽象为以下生命周期；后续实现时按插槽接入现有链路。

- `onStageEnter`
  - 触发：进入回合 2/4/6/8 阶段时。
  - 用途：发放阶段性增益、重置阶段计数、写日志/推送切换事件。
- `onRoundStart`
  - 触发：每回合开始时（天气持续期间）。
  - 用途：按生命比较施加状态（中毒/力量等）、回合性增减。
- `onAttackSelect`
  - 触发：攻击方确认选骰后（可读取攻击选中骰、攻击值、当前生命等）。
  - 用途：洞穿、连击、攻击值修正、瞬伤等攻击侧效果。
- `onDefenseSelect`
  - 触发：防守方确认选骰后（可读取防守选中骰、防守值）。
  - 用途：防御值修正、力场、反击准备等防守侧效果。
- `onAfterDamageResolved`
  - 触发：攻防结算后。
  - 用途：吸血/治疗、互换生命等需依赖最终伤害结果的效果。
- `onStageExit`
  - 触发：切到下一天气阶段前。
  - 用途：清理“仅在本次天气持续”的状态。

## 4. 已有机制复用映射表

| 天气语义 | 推荐复用对象 | 推荐触发点 | 说明 |
| --- | --- | --- | --- |
| 力量层数 | `game.power[playerId]` | `onStageEnter/onRoundStart/onAttackSelect` | 天气层数可直接累加；若需全员生效，天气模块负责将其转为攻击值修正。 |
| 中毒层数 | `game.poison[playerId]` | `onRoundStart/onStageEnter` | 复用现有回合末掉血与层数衰减。 |
| 连击 | `game.extraAttackQueued` | `onAttackSelect` | 与复读连击共用同一结算通道。 |
| 反击 | `game.counterActive[playerId]` | `onDefenseSelect/onRoundStart` | 复用现有反击结算逻辑。 |
| 洞穿 | `game.attackPierce` | `onAttackSelect` | 复用力场穿透判定。 |
| 力场 | `game.forceField[playerId]` | `onDefenseSelect` | 复用防守阶段的伤害归零机制。 |
| 韧性 | `game.resilience[playerId]` | `onAttackSelect/onStageEnter` | 可用于防守值加成或满层触发瞬伤。 |
| 荆棘 | `game.thorns[playerId]` | `onStageEnter/onRoundStart` | 复用结算前自伤并清空。 |
| 瞬伤 | `pushEffectEvent(...instant_damage)` | `onAttackSelect/onAfterDamageResolved` | 用于“直接造成X点伤害”类效果。 |
| 治疗 | `pushEffectEvent(...heal)` | `onAfterDamageResolved/onDefenseSelect` | 用于“治愈/虹吸回复”类效果。 |
| 攻防等级临时修正 | `game.attackLevel/game.defenseLevel` | `onStageEnter/onRoundStart` | 文档定义为“阶段性临时修正”，阶段切换时需回收。 |
| 额外重投 | `game.rerollsLeft` | `onStageEnter/onAttackSelect/onDefenseSelect` | 仅对当前回合生效的补正，回合切换需重算。 |

## 5. 分阶段天气卡目录（按截图可读内容）

说明：

- 列名含义：`类型(坚守|助力|进攻|逆转)`、触发时机、条件/效果、推荐复用字段。
- 遮挡或歧义字段以 `TODO(待确认文案)` 标注，并保留推荐映射。

### 5.1 回合 2 阶段候选池（9）

| 名称 | 类型 | 触发时机 | 条件与效果（可读文本） | 推荐复用字段 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 霜 | 坚守 | `onAttackSelect` | 若攻击方选择的骰子中包含相同点数，则下回合其防御等级 +1 | `game.defenseLevel` | 阶段内临时修正，需在阶段退出回收。 |
| 青蛙雨 | 助力 | 掷骰阶段 | 双方所有骰子均不会掷出最小值 | 掷骰逻辑修正（普通骰/曜彩骰） | 可通过重投直到非最小值实现。 |
| 细雪 | 坚守 | `onRoundStart` | 攻击回合若未重投，则获得 3 层仅下回合可用的韧性 | `game.resilience` | 需维护“本回合是否重投”标记。 |
| 鱼雨 | 助力 | `onAttackSelect/onDefenseSelect` | 双方在攻击/防御时，都会额外获得 1 次重投机会 | `game.rerollsLeft` | 仅当回合生效。 |
| 幻日 | 进攻 | 选骰阶段 | 额外多 2 次重投机会，但每次执行重投时会被施加 2 层荆棘 | `game.rerollsLeft` + `game.thorns` | 荆棘按重投动作触发，复用结算前自伤并清空。 |
| 飓风 | 进攻 | `onAttackSelect` | 双方攻击时均获得 1 连击 | `game.extraAttackQueued` | 与复读叠加规则需后续明确。 |
| 雨夹雪 | 助力 | `onRoundStart` | 生命值不为满的玩家，获得反击，且防御等级 +2 | `game.counterActive` + `game.defenseLevel` | 防御等级加成为阶段性临时修正。 |
| 日食 | 进攻 | `onAttackSelect` | 双方攻击时，若选择的骰子中包含不同点数，则攻击值 +4 | `game.attackValue` | 直接加值。 |
| 雷雨 | 助力 | `onAttackSelect/onDefenseSelect` | 攻击方攻击值 +4，防守方防御值 +4 | `game.attackValue/game.defenseValue` | 选骰确认时生效：攻击确认加攻击值，防守确认加防守值。 |

### 5.2 回合 4 阶段候选池（8）

| 名称 | 类型 | 触发时机 | 条件与效果（可读文本） | 推荐复用字段 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 暴雪 | 坚守 | `onDefenseSelect` | 防御方选定骰子时，若防御值 < 8 点，则其在本回合获得力场 | `game.forceField` | 本回合有效。 |
| 烈日 | 进攻 | `onAfterDamageResolved` | 双方攻击时，造成伤害后回复伤害值的 50%（向下取整，且不超过最大生命值） | `pushEffectEvent(...heal)` | 与白厄“虹吸”机制一致。 |
| 酸雨 | 助力 | `onRoundStart` | 每回合开始时：场上生命值更多的一方，会被附加 1 层中毒 | `game.poison` | 若平血则不触发。 |
| 高温 | 进攻 | `onRoundStart` | 回合开始时：场上生命值更少的一方，获得 2 层力量，持续到本次天气结束 | `game.power` | 阶段结束时清理来源于该天气的力量加成。 |
| 暴雨 | 逆转 | `onStageEnter` | 双方额外攻击等级 +1，防御等级 +1 | `game.attackLevel/game.defenseLevel` | 阶段退出恢复。 |
| 中雪 | 坚守 | `onAttackSelect/onDefenseSelect` | 双方攻击或防御时，若选择的骰子包含 3 个相同点数，则治愈 10 点生命值 | `pushEffectEvent(...heal)` | 回复不超过 `maxHp`。 |
| 大雪 | 坚守 | `onAttackSelect/onDefenseSelect` | 选定骰子时，若包含 7，则攻击值/防御值 +4 | `game.attackValue/game.defenseValue` | 双方通用。 |
| 沙尘 | 进攻 | `onAttackSelect` | 攻击方选定骰子时，若点数全为奇数，则获得 3 层力量 | `game.power` | 是否即时作用当前攻击，后续实现时明确。 |

### 5.3 回合 6 阶段候选池（7）

| 名称 | 类型 | 触发时机 | 条件与效果（可读文本） | 推荐复用字段 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 云海 | 助力 | `onStageEnter` | 变换至此天气时，双方获得 1 次曜彩骰使用次数 | `game.auroraUsesRemaining` | 一次性发放。 |
| 彩虹 | 进攻 | `onAttackSelect` | 攻击方选定骰子时，若攻击值 <= 10，获得洞穿 | `game.attackPierce` | 本次攻击生效。 |
| 干旱 | 进攻 | `onAttackSelect` | 根据对方防御等级，每一级攻击方附加 3 点攻击值 | `game.attackValue` + `game.defenseLevel` | 加值 = `defenseLevel * 3`。 |
| 日月同辉 | 逆转 | `onAttackSelect` | 攻击方选定骰子时，若当前生命值 <= 3，攻击值翻倍 | `game.attackValue` | 倍率效果。 |
| 云隙光 | 进攻 | `onAttackSelect` | 生命值更少的玩家，攻击时获得连击 | `game.extraAttackQueued` | 同血时不触发。 |
| 时空暴 | 逆转 | `onAfterDamageResolved` | 攻击方选定骰子时，若点数全为 6，双方生命值互换 | `game.hp` | 推荐放在伤害结算后执行，避免覆盖当次战斗日志。 |
| 晴天雨 | 进攻 | 掷骰阶段 | 防御方骰子无法掷出最大值 | 掷骰逻辑修正 | 普通骰与曜彩骰是否都限制需实现时确认。 |

### 5.4 回合 8 阶段候选池（3）

| 名称 | 类型 | 触发时机 | 条件与效果（可读文本） | 推荐复用字段 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 晴 | 进攻 | `onStageEnter` | 双方获得 5 层力量，持续到本次天气结束 | `game.power` | 终盘阶段长期效果。 |
| 晴雷 | 逆转 | `onAttackSelect` | 攻击方选定骰子时，直接造成 3 点瞬伤 | `pushEffectEvent(...instant_damage)` | 瞬伤不走攻防差值结算。 |
| 毒雾 | 逆转 | `onStageEnter` | 双方均被附加 2 层中毒 | `game.poison` | 立即入层。 |

### 5.5 阶段总表统计

- 回合 2 阶段：9 张
- 回合 4 阶段：8 张
- 回合 6 阶段：7 张
- 回合 8 阶段：3 张
- 合计：27 张（按当前截图可见卡池）

## 6. TODO（遮挡/歧义文案）

- 当前版本暂无未确认文案项。
- 后续若新增天气卡或发现新遮挡文本，再在本节补充。

## 7. 后续落地接线建议（仅建议）

### 7.1 服务端主要接点

- 以 [handlers.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/server/handlers.js) 为主接线：
  - `goNextRound`：处理阶段切换、`onStageEnter/onStageExit/onRoundStart`。
  - `handleConfirmAttack`：处理 `onAttackSelect`。
  - `handleConfirmDefense`：处理 `onDefenseSelect/onAfterDamageResolved`。
- 以 [skills.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/server/skills.js) 的现有模式复用即时伤害/治疗/状态结算。

### 7.2 状态与同步建议

- 未来建议在 `game` 内新增天气对象（示例）：
  - `game.weather = { stageRound, weatherId, weatherName, enteredAtRound, remains, meta }`
- 未来建议通过 `room_state.room.game.weather` 下发当前天气。
- 可选事件推送：
  - `weather_changed`：用于前端天气动画和日志高亮。

### 7.3 兼容原则

- 不改已有角色 hooks 与曜彩 hooks 的语义。
- 天气加成作为外层增量，在结算链路的固定插槽执行。
- 同名效果优先复用已有字段，避免并行重复状态。

## 8. 自动化测试矩阵（WEATHER-*）

### 8.1 WEATHER-FLOW-*（时序/轮换）

| 测试ID | 前置条件 | 操作 | 预期 |
| --- | --- | --- | --- |
| WEATHER-FLOW-001 | 新对局 | 进入第1回合 | 无天气对象或`weatherId=null` |
| WEATHER-FLOW-002 | 第1回合结束 | 进入第2回合 | 触发天气切换，天气来自回合2候选池 |
| WEATHER-FLOW-003 | 第3回合结束 | 进入第4回合 | 天气切换为回合4候选池中的一项 |
| WEATHER-FLOW-004 | 第7回合结束 | 进入第8回合 | 切换到回合8候选池，后续不再换阶段 |
| WEATHER-FLOW-005 | 同一阶段内 | 连续2回合 | 天气保持不变，直到下一阶段入口 |

### 8.2 WEATHER-EFFECT-*（效果复用）

| 测试ID | 前置条件 | 操作 | 预期 |
| --- | --- | --- | --- |
| WEATHER-EFFECT-001 | 天气=毒雾 | 切入阶段 | 双方`poison`均+2 |
| WEATHER-EFFECT-002 | 天气=飓风 | 攻击选骰确认 | `extraAttackQueued=true`并触发双段结算 |
| WEATHER-EFFECT-003 | 天气=彩虹 | 攻击值<=10确认 | `attackPierce=true` |
| WEATHER-EFFECT-004 | 天气=暴雪 | 防守值<8确认 | `forceField=true`且该回合挡伤 |
| WEATHER-EFFECT-005 | 天气=中雪 | 满足3同点 | 触发`heal`事件，HP不超过`maxHp` |
| WEATHER-EFFECT-006 | 天气=晴雷 | 攻击选骰确认 | 触发`instant_damage` 3点（瞬伤） |
| WEATHER-EFFECT-007 | 天气=时空暴 | 全6后结算 | 双方HP互换且不破坏`winner`判定 |
| WEATHER-EFFECT-008 | 天气=雨夹雪 | 非满血玩家回合开始 | `counterActive=true`且`defenseLevel`临时+2 |
| WEATHER-EFFECT-009 | 天气=幻日 | 同回合执行2次重投 | 每次重投均使`thorns`+2，并在结算前按荆棘规则自伤清空 |
| WEATHER-EFFECT-010 | 天气=雷雨 | 完成攻击确认+防守确认 | 攻击确认时攻方攻击值+4，防守确认时守方防守值+4 |
| WEATHER-EFFECT-011 | 天气=烈日 | 造成总伤害后结算 | 回复`floor(总伤害*0.5)`且回复后不超过`maxHp` |

### 8.3 WEATHER-SYNC-*（联机一致性）

| 测试ID | 前置条件 | 操作 | 预期 |
| --- | --- | --- | --- |
| WEATHER-SYNC-001 | A/B同房 | 进入第2回合 | A/B收到相同`weatherId` |
| WEATHER-SYNC-002 | A/B同房 | 阶段切换时广播 | 双端日志出现同一条天气切换记录 |
| WEATHER-SYNC-003 | 新加入观战/重连（若支持） | 请求最新`room_state` | 能拿到当前天气快照并正确渲染 |

### 8.4 WEATHER-NEG-*（异常/防抖）

| 测试ID | 前置条件 | 操作 | 预期 |
| --- | --- | --- | --- |
| WEATHER-NEG-001 | 构造未知`weatherId` | 进入结算链路 | 服务端降级为“无天气”，不崩溃 |
| WEATHER-NEG-002 | 同一回合重复触发切换 | 强制重复调用切换函数 | 仅生效一次（幂等） |
| WEATHER-NEG-003 | 候选池为空 | 进入新阶段 | 回退到`weather=null`并记录告警日志 |
| WEATHER-NEG-004 | 天气效果与角色/曜彩同名状态冲突 | 触发同回合叠加 | 使用统一字段叠加，不出现重复扣算 |

## 9. 本文档默认假设

- 文档位置固定为：`WEATHER_SYSTEM_SPEC.md`。
- 轮换规则固定：第 1 回合无天气，后续在 `2/4/6/8` 阶段入口切换。
- 每阶段随机 1 个天气生效并广播全房间。
- 截图遮挡文案按 `TODO(待确认文案)` 保留，不臆造最终数值。
- 本轮不包含任何代码实现或协议变更。
