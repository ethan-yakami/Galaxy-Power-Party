# 服务端技能结算与文本一致性专项测试文档

- 文档版本：v1.0
- 更新时间：2026-04-09
- 适用仓库：`C:\Users\user\Desktop\Galaxy-Power-Party-master`
- 目标：沉淀“仅服务端”的可执行级测试文档，重点覆盖技能结算与文本一致性

## 1. 范围与边界

### 1.1 本文档纳入范围

1. 服务端结算链路与状态变更（回合、攻防、伤害、状态、天气）。
2. 角色技能、曜彩骰条件与 A 效果、天气机制、自定义角色校验与持久化。
3. 双基线一致性检查：
   - 基线 A：实体文本（`skillText/effectText/conditionText`）。
   - 基线 B：机制文档文本（`MECHANISMS_AND_TESTS.md` 与 `WEATHER_SYSTEM_SPEC.md`）。
4. 可重复执行要求：依赖随机的场景必须可控（固定随机序列/种子）。

### 1.2 本文档排除范围

1. 客户端 UI、动效、DOM 渲染、前端交互体验。
2. AI 行为策略正确性与强度评估。
3. 网络层可靠性、联机同步时延/丢包/断线恢复专项。

### 1.3 代码真相来源模块（唯一裁决依据）

1. `server/handlers.js`
2. `server/skills.js`
3. `server/weather.js`
4. `server/entities/characters/*.js`
5. `server/entities/auroras/*.js`
6. `server/dice.js`
7. `server/registry.js`
8. `server/rooms.js`

## 2. 术语与约定

1. 代码现状断言：以当前代码可复现行为为准。
2. 文本期望断言：以双基线文本语义为准。
3. 一致性结论三态：
   - `一致`：代码现状与文本期望无冲突。
   - `不一致`：代码现状与文本期望明确冲突。
   - `待产品确认`：文本本身冲突/歧义或实现语义未定。
4. 本文档用例均为服务端白盒执行，不依赖真实 WebSocket 联机。

## 3. 当前代码结算顺序（严格链路）

### 3.1 攻击确认链路（`handleConfirmAttack`）

1. 校验阶段、操作者身份与选骰数量/去重合法性。
2. 命运曜彩强制选中校验（若攻击骰池存在 `destiny`）。
3. 统计计数更新：`selectedFourCount/selectedOneCount`。
4. 角色跃升：`applyAscension`（在攻击值求和之前）。
5. 角色攻击前钩子：`onAttackConfirm`。
6. 写入攻击选择与攻击值：`attackSelection/attackValue`。
7. 角色主攻击钩子：`onMainAttackConfirm`。
8. 曜彩攻击侧 A 效果：`applyAuroraAEffectOnAttack`。
9. 天气攻击插槽：`onAttackSelect`。
10. `checkGameOver`（存在攻击阶段瞬伤导致提前结束的可能）。
11. 进入防守投骰阶段：`phase = defense_roll`。

### 3.2 防守确认链路（`handleConfirmDefense`）

1. 校验阶段、操作者身份与选骰数量/去重合法性。
2. 命运曜彩强制选中校验（若防守骰池存在 `destiny`）。
3. 统计计数更新：`selectedFourCount/selectedOneCount`。
4. 角色跃升：`applyAscension`（在防守值求和之前）。
5. 角色防守确认钩子：`onDefenseConfirm`。
6. 写入防守选择与防守值：`defenseSelection/defenseValue`。
7. 角色主防守钩子：`onMainDefenseConfirm`。
8. 曜彩防守侧 A 效果：`applyAuroraAEffectOnDefense`。
9. 骇入修正：`applyHackEffects`。
10. 天气防守插槽：`onDefenseSelect`。
11. 超载防御自伤：`ceil(overload * 0.5)`。
12. 荆棘自伤结算并清空：`applyThornsDamage`。
13. 伤害计算：`calcHits` -> 力场屏蔽 -> 白厄/不屈保底裁剪。
14. 结算伤害事件：`damage_resolution`。
15. 累计受伤更新：`cumulativeDamageTaken`。
16. 遐蝶被击被动：`onDamageApplied`。
17. 攻击方后置：`onAttackAfterDamageResolved`。
18. 防守方后置：`onAfterDamageResolved`。
19. 天气伤后插槽：`onAfterDamageResolved`（weather）。
20. 通用反击结算：`counterActive`。
21. `checkGameOver`。
22. 未结束则 `goNextRound`，再二次 `checkGameOver`（中毒/回合末钩子可能终结）。

### 3.3 回合推进链路（`goNextRound`）

1. 当前回合结束天气钩子：`onEndCurrentRound`。
2. 中毒回合末伤害与层数衰减（每人 `-poison`，随后 `poison--`）。
3. 角色 `onRoundEnd`（如大黑塔回充曜彩次数）。
4. 轮次与攻防互换，重置当回合临时状态。
5. 天气更新：`updateWeatherForNewRound`（含阶段切换、阶段/回合加成处理）。
6. 生成并广播 `weather_changed`（仅当本回合新入天气阶段）。

## 4. 文本一致性判定规则

### 4.1 双基线优先级

1. 先核对实体文本：`server/entities/*`。
2. 再核对机制文档：`MECHANISMS_AND_TESTS.md`、`WEATHER_SYSTEM_SPEC.md`。
3. 若双基线互相冲突，结论先标记 `待产品确认`，并保留“代码现状断言”用于回归。

### 4.2 冲突记录规范

每条冲突必须包含：

1. 冲突 ID（`TXT-MIS-*`）。
2. 触发前置与最小复现步骤。
3. 代码现状断言（可机审）。
4. 文本期望断言（原文语义）。
5. 影响评估（P0/P1/P2）。
6. 建议处置（改代码 / 改文本 / 待确认）。

## 5. 测试执行模型（非联机白盒）

### 5.1 执行模型

1. 使用内存 `rooms = new Map()`。
2. 通过 `createHandlers(rooms)` 直接调用 handler。
3. 构造 mock `ws`：
   - `readyState = 1`
   - `playerId/playerRoomCode`
   - `send(payload)` 收集消息
4. 不使用真实网络，不建立真实 WebSocket Server。

### 5.2 通用执行步骤（GS）

1. `GS-1`：初始化房间和双玩家，设置角色/曜彩。
2. `GS-2`：推进到目标 phase（必要时直接注入 `room.game`）。
3. `GS-3`：固定随机序列（见第 8 节）。
4. `GS-4`：触发目标 handler/hook。
5. `GS-5`：读取 `room.game`、`effectEvents`、`log`、发送消息缓存。
6. `GS-6`：执行代码现状断言。
7. `GS-7`：执行文本期望断言。
8. `GS-8`：输出一致性结论与标签。

## 6. 统一用例结构（测试文档接口）

每条用例必须具备以下字段：

1. `ID`
2. `优先级`（P0/P1/P2）
3. `基线来源`
4. `前置状态`
5. `操作步骤`
6. `观测字段`
7. `代码现状断言`
8. `文本期望断言`
9. `一致性结论`
10. `自动化标签`

## 7. 统一观测字段集合

`hp/maxHp`、`attackValue/defenseValue`、`attackPierce`、`forceField`、`counterActive`、`overload`、`power`、`poison`、`resilience`、`thorns`、`desperateBonus`、`auroraUsesRemaining`、`effectEvents`、`log`、`phase/round`

## 8. 随机控制约定（可重复性）

### 8.1 强制要求

1. 所有依赖骰面或天气抽取的用例必须声明固定随机策略。
2. 未声明随机控制的用例视为不可回归，不得进入准入集合。

### 8.2 推荐实现

1. 测试前暂存 `Math.random`。
2. 注入序列函数（例如 `[0.01, 0.99, 0.5, ...]` 循环）。
3. 用例结束后恢复 `Math.random`。

## 9. 用例目录（完整矩阵）

| 分组 | 数量 | 说明 |
| --- | ---: | --- |
| FLOW-SRV | 12 | 服务端主流程与非法输入路径 |
| CHAR | 14（每条含 P/N/O 子用例） | 14 名基础角色全覆盖 |
| AURORA | 19（含条件/触发/交互子用例） | 19 个曜彩骰全覆盖 |
| WEATHER | 36 | 轮换流程 + 27 天气逐项行为 + 清理/降级 |
| CROSS | 8 | 跨机制叠加顺序与互斥规则 |
| CUSTOM | 10 | 自定义角色校验与持久化 |
| TXT-MIS | 8 | 文本与代码不一致专项 |

## 10. FLOW-SRV 用例矩阵

| ID | 优先级 | 基线来源 | 前置状态 | 操作步骤 | 观测字段 | 代码现状断言 | 文本期望断言 | 一致性结论 | 自动化标签 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FLOW-SRV-001 | P0 | handlers/rooms | 双人房间，双方角色已选，且需曜彩角色已装备 | GS-1 -> `startGameIfReady` | `status/phase/attackerId` | 自动进入 `in_game` 且 `phase=attack_roll` | 与机制文档开局流程一致 | 一致 | smoke,flow,server_core |
| FLOW-SRV-002 | P0 | handlers | `phase=attack_roll`，操作者为攻击方 | 调 `handleRollAttack` | `phase/attackDice/rerollsLeft` | 进入 `attack_reroll_or_select`，并按角色重投上限设置 `rerollsLeft` | 与流程文本一致 | 一致 | smoke,attack_roll |
| FLOW-SRV-003 | P0 | handlers+dice | `phase=attack_reroll_or_select`，`indices=[1,1,3,3]` | 调 `handleRerollAttack` | `attackDice/rerollsLeft/log` | 重投索引去重后仅重投 1、3；`rerollsLeft` 仅 -1 | 与机制文档一致 | 一致 | deterministic,dice |
| FLOW-SRV-004 | P0 | handlers | `phase=attack_reroll_or_select`，越界索引 | 调 `handleRerollAttack` | 错误消息、状态快照 | 返回 `error` 且状态不变 | 与文本一致 | 一致 | negative,validation |
| FLOW-SRV-005 | P0 | handlers+dice | 攻击确认时选骰数量不等于 `attackLevel` | 调 `handleConfirmAttack` | 错误消息、`attackSelection` | 返回 `error`，不写入攻击结果 | 与文本一致 | 一致 | negative,validation |
| FLOW-SRV-006 | P0 | handlers | 攻击骰池含 `destiny` 且未选中该骰 | 调 `handleConfirmAttack` | 错误消息 | 返回“命定必须选中”错误 | 与实体/机制文本一致 | 一致 | destiny,rule |
| FLOW-SRV-007 | P0 | handlers | `phase=defense_roll`，操作者为防守方 | 调 `handleRollDefense` | `phase/defenseDice` | 进入 `defense_select` 且生成防守骰 | 与流程文本一致 | 一致 | smoke,defense_roll |
| FLOW-SRV-008 | P0 | handlers+dice | 防守确认选骰数量非法 | 调 `handleConfirmDefense` | 错误消息、`defenseSelection` | 返回 `error`，不进入伤害结算 | 与文本一致 | 一致 | negative,validation |
| FLOW-SRV-009 | P0 | handlers | 防守骰池含 `destiny` 且未选中 | 调 `handleConfirmDefense` | 错误消息 | 返回“命定必须选中” | 与实体/机制文本一致 | 一致 | destiny,rule |
| FLOW-SRV-010 | P0 | handlers+skills | 结算后一方 `hp<=0` | 走完整攻防确认链路 | `status/phase/winnerId/log` | `status=ended` 且 `winnerId` 存在 | 与机制文档一致 | 一致 | gameover |
| FLOW-SRV-011 | P0 | skills.checkGameOver | 人为构造双方同结算归零 | 触发 `checkGameOver` | `winnerId/log` | 同归于尽判定攻击方胜 | 与机制文档一致 | 一致 | edge,gameover |
| FLOW-SRV-012 | P1 | handlers | 终局后触发 `play_again` | 调 `handlePlayAgain` | `status/game/waitingReason` | 回到 `lobby`，`game=null`，等待重新配置 | 与流程文本一致 | 一致 | reset,lobby |

## 11. CHAR 用例矩阵（14 角色全覆盖）

说明：每行均包含 `P(正向)`、`N(边界/负向)`、`O(顺序断言)` 三个子用例。

| ID | 优先级 | 基线来源 | 前置状态 | 操作步骤 | 观测字段 | 代码现状断言 | 文本期望断言 | 一致性结论 | 自动化标签 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHAR-BAIE | P0 | `baie.skillText` + handlers | 防守方=白厄 | P: 防守全同点且 `whiteeGuardUsed=false`；N: 再次全同点；O: 多段高伤命中 | `whiteeGuardUsed/whiteeGuardActive/hp/log` | P 触发守护；N 单局不可二次触发；O 生命下限保留至1 | 文本“每局1次 + 最低降到1 + 攻后吸收50%” | 一致 | char,whitee |
| CHAR-DAHEITA | P1 | `daheita.skillText` + hooks | 任意对局 | P: 回合结束；N: `auroraAEffectCount=3`；O: `auroraAEffectCount>=4` 后确认选骰 | `auroraUsesRemaining/auroraAEffectCount/selectedDice/log` | P 每回合+1曜彩次数；N 不跃升；O 达阈值后跃升生效且在求和前改最小骰 | 与文本一致 | 一致 | char,ascension |
| CHAR-DANHENG | P0 | `danheng.skillText` + handlers | 攻击方=丹恒，后续进入其防守回合 | P: 攻击值>=18后再防守；N: 攻击为洞穿时；O: 防守结算后检查等级回收 | `danhengCounterReady/defenseLevel/counterDamage/log` | P 准备反击并临时防等+3；N 洞穿时不反伤；O 结算后回收+3与 ready 标记 | 与文本一致 | 一致 | char,counter |
| CHAR-FENGJIN | P1 | `fengjin.skillText` | 攻击方=风堇 | P: `power>0` 后确认攻击；N: 全6且满血附近；O: 伤后力量累积时点 | `power/attackValue/hp/log` | P 力量直接加攻击值；N 全6走100%累积并治疗封顶；O 累积在伤后钩子执行 | 与文本一致 | 一致 | char,power |
| CHAR-HUANGQUAN | P0 | `huangquan.skillText` + skills | 攻击方=黄泉 | P: 选骰全4；N: 非全4；O: 目标有力场 | `attackPierce/attackLevel/forceField/log` | P 洞穿=true且攻等+1；N 不触发；O 洞穿无视防御与力场 | 与文本一致 | 一致 | char,pierce |
| CHAR-HUOHUA | P1 | `huohua.skillText` + skills.applyHackEffects | 火花参与攻防回合 | P: 攻击选骰有重复；N: 防守无重复；O: 防守确认后骇入改骰 | `hackActive/attackValue/defenseValue/selectedDice` | P 激活骇入；N 不激活；O 把对方已选最大非曜彩骰改为2并修正值 | 与文本一致 | 一致 | char,hack |
| CHAR-KAFUKA | P1 | `kafuka.skillText` | 攻击方=卡芙卡 | P: 攻击选择多个不同点数；N: 防守受伤=0；O: 防守方受伤>0后检查去毒时点 | `poison/totalDamage/log` | P 给对手加中毒=不同点数数；N 不去毒；O 受伤后移除对方1层中毒 | 与文本一致 | 一致 | char,poison |
| CHAR-LIUYING | P1 | `liuying.skillText` | 攻击方=流萤 | P: 形成两组对子；N: 仅一组对子；O: 满血+5与后续曜彩/天气叠加顺序 | `extraAttackQueued/attackValue/hp/log` | P 连击触发；N 不触发；O 满血+5在 `onMainAttackConfirm` 生效 | 与文本一致 | 一致 | char,double_hit |
| CHAR-SANYUEQI | P1 | `sanyueqi.skillText` | 三月七参与攻防 | P: 攻击对子；N: 无对子；O: 防守对子瞬伤时点 | `effectEvents/hp/log/phase` | P/N 与对子数一致；O 防守瞬伤在主伤害前入队 | 与文本一致 | 一致 | char,instant_damage |
| CHAR-SHAJIN | P1 | `shajin.skillText` | 攻击方=砂金 | P: 奇数累计至>=7；N: 韧性不足7；O: 防守时韧性加防 | `resilience/defenseValue/effectEvents/log` | P 每满7触发7点瞬伤并扣7层，可循环；N 不触发瞬伤；O 防守值增加当前韧性 | 与文本一致 | 一致 | char,resilience |
| CHAR-XIADIE | P1 | `xiadie.skillText` + handlers顺序 | 防守方=遐蝶 | P: 单段命中>=8；N: 无伤/伤害>5不触发小伤；O: 多段命中分别判定 | `attackLevel/defenseLevel/effectEvents/cappedHits` | P 攻防+1；N 条件不满足不瞬伤；O 对每个 hit 独立触发 <=5 则3点瞬伤 | 与文本一致 | 一致 | char,per_hit |
| CHAR-XILIAN | P1 | `xilian.skillText` | 昔涟参与多回合 | P: 累计攻防值>24；N: 累计=24；O: 激活后后续确认触发跃升 | `xilianCumulative/xilianAscensionActive/attackLevel` | P 激活并把攻击等级设为5；N 不激活；O shouldAscend=true 后每次确认前可跃升 | 与文本一致 | 一致 | char,growth |
| CHAR-YAOGUANG | P1 | `yaoguang.skillText` | 攻击方=爻光 | P: 初始重投次数；N: 重投<=2；O: 重投>2后荆棘与>=18清空+回充 | `rerollsLeft/yaoguangRerollsUsed/thorns/auroraUsesRemaining` | P 重投上限=4；N 不加荆棘；O 超2次每次+2荆棘，攻击>=18清空荆棘并+1曜彩次数 | 与文本一致 | 一致 | char,reroll |
| CHAR-ZHIGENGNIAO | P0 | `zhigengniao.skillText` + rooms.readyToStart | 知更鸟参与开局和攻击 | P: 攻击全偶数；N: 含奇数；O: auroraUses=0 开局不需装备曜彩 | `diceSidesByPlayer/selectedDice/waitingReason` | P 非曜彩被选骰对应面数升级；N 不升级；O 可不选曜彩直接开局 | 与文本一致 | 一致 | char,upgrade,setup |

## 12. AURORA 用例矩阵（19 曜彩全覆盖）

说明：每行包含 `C(条件)`、`A(A效果)`、`I(交互)` 子用例（若无条件或无A效果则写“无”）。

| ID | 优先级 | 基线来源 | 前置状态 | 操作步骤 | 观测字段 | 代码现状断言 | 文本期望断言 | 一致性结论 | 自动化标签 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AURORA-BERSERKER | P1 | `berserker.effectText` | 角色装备战狂 | C: 无；A: 选中 A 面；I: 进入防守确认后荆棘结算 | `thorns/effectEvents/log` | A 按 `floor(value/4)` 加荆棘；I 荆棘在结算点自伤并清空 | 与文本一致 | 一致 | aurora,thorns |
| AURORA-BIGREDBUTTON | P0 | `bigredbutton.effectText/conditionText` | 装备大红按钮 | C: 回合<5 或 role=defense；A: 回合>=5攻击选中A；I: 查看 `desperateBonus` 后续作用 | `hp/desperateBonus/attackValue/log` | C 不满足拒绝；A 将自身HP设1并累加 `desperateBonus`；I 当前链路未消费该加成 | 与文本“背水加攻”存在冲突点 | 不一致 | aurora,condition,txt_mis |
| AURORA-CACTUS | P1 | `cactus` | 防守方装备仙人球 | C: 攻击阶段尝试使用；A: 防守A触发；I: 防守值>攻击值时反击 | `counterActive/effectEvents/log` | C 仅防守可用；A 置 `counterActive=true`；I 非洞穿且守>攻时反伤差值 | 与文本一致 | 一致 | aurora,counter |
| AURORA-DESTINY | P0 | `destiny` + handlers 校验 | 任一方装备命运 | C: 无；A: 触发并写日志；I: 确认时若不选命运骰报错 | `attackDice/defenseDice/error/log` | I 在攻防确认均强制选中命运骰 | 与文本一致 | 一致 | aurora,destiny |
| AURORA-EVOLUTION | P1 | `evolution.effectText` | 装备进化 | C: 无；A: 攻击/防守选中2A；I: 与角色主钩子先后 | `attackValue/defenseValue/log` | A 在主钩子后把攻击值或防守值翻倍 | 与文本一致 | 一致 | aurora,multiplier |
| AURORA-GAMBLER | P1 | `gambler.conditionText` | 装备赌徒 | C: 回合<=4 与 >4 对比；A: 无；I: 数值面正常参与求和 | `round/error/attackValue/defenseValue` | 仅前4回合允许使用 | 与文本一致 | 一致 | aurora,condition |
| AURORA-HEARTBEAT | P1 | `heartbeat.effectText` | 装备心跳 | C: 无；A: A面触发；I: 本回合已用曜彩后回充可用于后续回合 | `auroraUsesRemaining/roundAuroraUsed/log` | A 每次 +1 曜彩次数 | 与文本一致 | 一致 | aurora,recharge |
| AURORA-LEGACY | P1 | `legacy.condition/effect` | 装备遗语 | C: `hp<=8` 与 `hp>8`；A: A面触发翻倍；I: 攻防侧均可翻倍 | `hp/error/attackValue/defenseValue` | C 条件严格按当前生命；A 攻防翻倍 | 与文本一致 | 一致 | aurora,condition,multiplier |
| AURORA-LOAN | P0 | `loan.effectText` + handlers | 装备贷款 | C: 无；A: A面触发累积超载；I: 防守确认触发自伤 `ceil(overload/2)` | `overload/hp/effectEvents/log` | A 可在攻防累层；I 仅在防守确认执行超载自伤 | 与“超载”完整语义存在缺口（见 TXT-MIS） | 待产品确认 | aurora,overload |
| AURORA-MAGICBULLET | P1 | `magicbullet.effectText` | 装备魔弹 | C: 无；A: A面触发；I: 攻防均可立即3点瞬伤 | `effectEvents/hp/log` | A 生成 `instant_damage` 事件，先于主伤害生效 | 与文本一致 | 一致 | aurora,instant_damage |
| AURORA-MEDIC | P1 | `medic.effectText` | 装备医嘱 | C: 无；A: A面触发回复；I: 满血不溢出 | `hp/maxHp/effectEvents/log` | 回复值=面值且不超过 `maxHp` | 与文本一致 | 一致 | aurora,heal |
| AURORA-MIRACLE | P1 | `miracle.conditionText` | 装备奇迹 | C: role=defense；`selectedOneCount<9`；`>=9` | `selectedOneCount/error` | 仅攻击可用且累计1点达到9才可用 | 与文本一致 | 一致 | aurora,condition |
| AURORA-OATH | P0 | `oath.effectText` | 装备誓言 | C: 仅防守；A: 触发不屈；I: 多段伤害下生命保底1 | `unyielding/hp/log` | C 防守限定；A `unyielding=true`；I 保底逻辑生效 | 与文本一致 | 一致 | aurora,unyielding |
| AURORA-PRIME | P2 | `prime` | 装备质数 | C: 无；A: 无；I: 仅数值面参与求和 | `attackValue/defenseValue` | 无额外效果，仅点数生效 | 与文本一致 | 一致 | aurora,baseline |
| AURORA-REPEATER | P1 | `repeater.condition/effect` | 装备复读 | C: `selectedFourCount<2` 与 `>=2`；A: 攻击A触发；I: 与连击布尔叠加 | `selectedFourCount/extraAttackQueued/error` | C 仅攻击可用；A 设置 `extraAttackQueued=true` | 与文本一致；防守hook可达性见 TXT-MIS | 待产品确认 | aurora,double_hit |
| AURORA-REVENGE | P1 | `revenge.conditionText` | 装备复仇 | C: `cumulativeDamageTaken<25` 与 `>=25`；A: 无；I: 攻击可用 | `cumulativeDamageTaken/error` | 达阈值后攻击阶段可用 | 与文本一致 | 一致 | aurora,condition |
| AURORA-SIXSIX | P2 | `sixsix` | 装备6·6 | C: 无；A: 无；I: 骰面恒定6 | `attackDice/defenseDice` | 仅提供稳定面值，无附加状态 | 与文本一致 | 一致 | aurora,baseline |
| AURORA-STARSHIELD | P0 | `starshield.condition/effect` | 装备星盾 | C: 攻击阶段尝试；A: 防守A触发；I: 非洞穿时屏蔽主伤害 | `forceField/hits/log` | C 只能防守；A 获得力场；I 常规伤害可被归零 | 与文本一致；攻击hook可达性见 TXT-MIS | 待产品确认 | aurora,force_field |
| AURORA-TRICKSTER | P1 | `trickster.effectText` | 装备奇术师 | C: 无；A: A触发骇入；I: 防守确认后改对手最大非曜彩骰 | `hackActive/attackValue/defenseValue/log` | A 激活 `hackActive` 并通过 `applyHackEffects` 落地 | 与文本一致 | 一致 | aurora,hack |

## 13. WEATHER 用例矩阵（流程 + 27 天气全覆盖）

### 13.1 WEATHER-FLOW（轮换与生命周期）

| ID | 优先级 | 基线来源 | 前置状态 | 操作步骤 | 观测字段 | 代码现状断言 | 文本期望断言 | 一致性结论 | 自动化标签 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WEATHER-FLOW-001 | P0 | weather + handlers | 新局第1回合 | 触发开局，不推进回合 | `weather.stageRound/weatherId` | 第1回合 `weatherId=null` | 与天气规范一致 | 一致 | weather,flow |
| WEATHER-FLOW-002 | P0 | weather.updateWeatherForNewRound | 第1回合结束 | 触发 `goNextRound` 到回合2 | `round/weatherId/candidates` | 回合2从阶段池随机1个天气 | 与天气规范一致 | 一致 | weather,stage |
| WEATHER-FLOW-003 | P1 | weather + handlers | 回合2已入天气 | 再进回合3 | `weatherId/enteredAtRound` | 回合3保持同天气，不重复切换 | 与规范一致 | 一致 | weather,stage |
| WEATHER-FLOW-004 | P0 | weather | 回合3结束 | 进入回合4 | `weather.stageRound/weatherId` | 切换至回合4天气池 | 与规范一致 | 一致 | weather,stage |
| WEATHER-FLOW-005 | P0 | weather | 回合5结束 | 进入回合6 | `weather.stageRound/weatherId` | 切换至回合6天气池 | 与规范一致 | 一致 | weather,stage |
| WEATHER-FLOW-006 | P0 | weather | 回合7结束 | 进入回合8并后续推进 | `weather.stageRound/weatherId` | 回合8切换后持续至终局 | 与规范一致 | 一致 | weather,stage |
| WEATHER-FLOW-007 | P1 | weather.pending | 命中 `frost/light_snow` 延迟收益 | 结束回合再开新回合 | `pendingDefenseBonus/pendingResilienceBonus/active*` | 延迟加成在新回合 `promotePendingRoundBonuses` 生效 | 与规范一致 | 一致 | weather,pending |
| WEATHER-FLOW-008 | P1 | weather.clearRoundBonuses | 存在 `activeDefenseBonus/activeResilienceBonus` | 推进到下一回合 | `activeDefenseBonus/activeResilienceBonus/defenseLevel/resilience` | 回合临时加成回收 | 与规范一致 | 一致 | weather,cleanup |
| WEATHER-FLOW-009 | P1 | weather.clearStageBonuses | `heavy_rain/clear/high_temp` 阶段切换前 | 从阶段N切到N+1 | `stageAttackLevelBonus/stageDefenseLevelBonus/stagePowerGranted` | 阶段型加成在切换时回收 | 与规范一致 | 一致 | weather,cleanup |

### 13.2 WEATHER-CARD（27 天气逐项）

| ID | 优先级 | 基线来源 | 前置状态 | 操作步骤 | 观测字段 | 代码现状断言 | 文本期望断言 | 一致性结论 | 自动化标签 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WEATHER-CARD-FROST | P1 | spec + weather | 当前天气=霜 | 攻击选骰出现重复 | `pendingDefenseBonus/log` | 攻方下回合防御等级+1（待提升） | 与规范一致 | 一致 | weather,frost |
| WEATHER-CARD-FROG_RAIN | P1 | spec + weather | 当前天气=青蛙雨 | 投骰/重投 | `attackDice/defenseDice` | 所有骰不出现最小值（可重抽） | 与规范一致 | 一致 | weather,constraint |
| WEATHER-CARD-LIGHT_SNOW | P1 | spec + weather | 当前天气=细雪 | 攻击回合不重投并结束回合 | `attackRerolledInRound/pendingResilienceBonus` | 次回合获得3层临时韧性 | 与规范一致 | 一致 | weather,resilience |
| WEATHER-CARD-FISH_RAIN | P1 | spec + weather | 当前天气=鱼雨 | 攻击方投攻骰 | `rerollsLeft/log` | 攻击回合额外重投+1 | 与规范一致 | 一致 | weather,reroll |
| WEATHER-CARD-ILLUSION_SUN | P0 | spec + weather | 当前天气=幻日 | 攻击回合重投N次 | `rerollsLeft/thorns/log` | 攻击回合额外重投+2；每次重投+2荆棘 | 与规范一致 | 一致 | weather,reroll,thorns |
| WEATHER-CARD-GALE | P1 | spec + weather | 当前天气=飓风 | 攻击确认 | `extraAttackQueued` | 本次攻击获得连击 | 与规范一致 | 一致 | weather,double_hit |
| WEATHER-CARD-SLEET | P1 | spec + weather | 当前天气=雨夹雪，存在非满血方 | 回合开始 | `counterActive/defenseLevel` | 非满血方获得反击且防等+2（回合临时） | 与规范一致 | 一致 | weather,counter |
| WEATHER-CARD-ECLIPSE | P1 | spec + weather | 当前天气=日食 | 攻击选骰非全同 | `attackValue/log` | 攻击值+4 | 与规范一致 | 一致 | weather,attack_bonus |
| WEATHER-CARD-THUNDER_RAIN | P0 | spec + weather | 当前天气=雷雨 | 攻击确认 + 防守确认 | `attackValue/defenseValue` | 攻击确认攻+4；防守确认守+4 | 与规范一致 | 一致 | weather,dual_bonus |
| WEATHER-CARD-BLIZZARD | P1 | spec + weather | 当前天气=暴雪 | 防守值<8确认 | `forceField/log` | 本回合获得力场 | 与规范一致 | 一致 | weather,force_field |
| WEATHER-CARD-SCORCHING_SUN | P0 | spec + weather | 当前天气=烈日 | 造成总伤害后 | `hp/healEvent/log` | 攻方回复 `floor(totalDamage*0.5)` 且不超 `maxHp` | 与规范一致 | 一致 | weather,heal |
| WEATHER-CARD-ACID_RAIN | P1 | spec + weather | 当前天气=酸雨，双方血量不等 | 回合开始 | `poison/log` | 血量更高方+1中毒 | 与规范一致 | 一致 | weather,poison |
| WEATHER-CARD-HIGH_TEMP | P1 | spec + weather | 当前天气=高温，双方血量不等 | 回合开始 | `power/stagePowerGranted` | 血量更低方阶段内+2力量 | 与规范一致 | 一致 | weather,power |
| WEATHER-CARD-HEAVY_RAIN | P1 | spec + weather | 当前天气=暴雨切入 | 进入阶段 | `attackLevel/defenseLevel/stage*` | 双方攻防等级阶段内各+1 | 与规范一致 | 一致 | weather,level |
| WEATHER-CARD-MID_SNOW | P1 | spec + weather | 当前天气=中雪 | 攻/守选骰出现三同 | `hp/healEvent` | 满足条件者回复10（封顶） | 与规范一致 | 一致 | weather,heal |
| WEATHER-CARD-BIG_SNOW | P1 | spec + weather | 当前天气=大雪 | 攻/守选骰包含7 | `attackValue/defenseValue` | 含7则对应值+4 | 与规范一致 | 一致 | weather,value_bonus |
| WEATHER-CARD-SANDSTORM | P1 | spec + weather | 当前天气=沙尘 | 攻击选骰全奇数 | `power/log` | 攻击方获得3层力量 | 与规范一致 | 一致 | weather,power |
| WEATHER-CARD-CLOUD_SEA | P1 | spec + weather | 当前天气=云海切入 | 进入阶段 | `auroraUsesRemaining` | 双方各+1曜彩次数 | 与规范一致 | 一致 | weather,aurora_uses |
| WEATHER-CARD-RAINBOW | P1 | spec + weather | 当前天气=彩虹 | 攻击确认时攻击值<=10 | `attackPierce/log` | 本次攻击获得洞穿 | 与规范一致 | 一致 | weather,pierce |
| WEATHER-CARD-DROUGHT | P1 | spec + weather | 当前天气=干旱 | 攻击确认 | `attackValue/defenseLevel` | 攻击值增加 `defender.defenseLevel*3` | 与规范一致 | 一致 | weather,scaling |
| WEATHER-CARD-SUN_MOON | P1 | spec + weather | 当前天气=日月同辉 | 攻击方 `hp<=3` 确认攻击 | `attackValue` | 攻击值翻倍 | 与规范一致 | 一致 | weather,multiplier |
| WEATHER-CARD-SUNBEAM | P1 | spec + weather | 当前天气=云隙光，攻方血量更低 | 攻击确认 | `extraAttackQueued` | 生命更低方攻击获连击 | 与规范一致 | 一致 | weather,double_hit |
| WEATHER-CARD-SPACETIME_STORM | P0 | spec + weather | 当前天气=时空暴，攻击选骰全6 | 完成伤害结算 | `hp/log` | 伤后交换双方生命值 | 与规范一致 | 一致 | weather,hp_swap |
| WEATHER-CARD-SUNNY_RAIN | P1 | spec + weather | 当前天气=晴天雨 | 防守投骰/重投 | `defenseDice` | 防守骰不会掷出最大值 | 与规范一致 | 一致 | weather,constraint |
| WEATHER-CARD-CLEAR | P1 | spec + weather | 当前天气=晴切入 | 进入阶段 | `power/stagePowerGranted` | 双方阶段内各+5力量 | 与规范一致 | 一致 | weather,power |
| WEATHER-CARD-CLEAR_THUNDER | P0 | spec + weather | 当前天气=晴雷 | 攻击确认 | `effectEvents/hp/log` | 立即对目标造成3点瞬伤 | 与规范一致 | 一致 | weather,instant_damage |
| WEATHER-CARD-TOXIC_FOG | P1 | spec + weather | 当前天气=毒雾切入 | 进入阶段 | `poison/log` | 双方各+2中毒 | 与规范一致 | 一致 | weather,poison |

### 13.3 WEATHER-NEG（防御性）

| ID | 优先级 | 基线来源 | 前置状态 | 操作步骤 | 观测字段 | 代码现状断言 | 文本期望断言 | 一致性结论 | 自动化标签 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WEATHER-NEG-001 | P1 | weather | 人工注入未知 `weatherId` | 调各天气插槽函数 | 稳定性、异常日志 | 不应抛异常，主流程可继续 | 规范建议应可降级 | 一致 | weather,negative |
| WEATHER-NEG-002 | P1 | weather | 候选池为空（mock） | 阶段切换 | `weatherId/log` | 回退 `weatherId=null` 并记录日志 | 与规范建议一致 | 一致 | weather,fallback |
| WEATHER-NEG-003 | P1 | handlers+weather | 同回合重复广播天气 | 多次 `broadcastRoom` | 消息缓存 | `pendingWeatherChanged` 发送一次后清空 | 与实现一致 | 一致 | weather,idempotent |

## 14. CROSS 用例矩阵（跨机制组合）

| ID | 优先级 | 基线来源 | 前置状态 | 操作步骤 | 观测字段 | 代码现状断言 | 文本期望断言 | 一致性结论 | 自动化标签 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CROSS-001 | P0 | handlers 顺序 + weather + entities | 角色技能、曜彩A、天气同回合触发 | 走完整攻击确认链路 | `attackValue/log` | 顺序固定：角色主攻 -> 曜彩A -> 天气攻击插槽 | 与规则设计一致 | 一致 | cross,order |
| CROSS-002 | P0 | handlers 顺序 + skills | 同回合触发骇入+天气+超载+荆棘 | 走防守确认链路 | `attackValue/defenseValue/hp/log` | 顺序固定：主防 -> 曜彩A -> 骇入 -> 天气 -> 超载 -> 荆棘 -> 主伤害 | 与规则设计一致 | 一致 | cross,order |
| CROSS-003 | P0 | skills.calcHits + forceField | 攻方洞穿，守方有力场 | 结算伤害 | `pierce/forceField/hits` | 洞穿时力场不生效 | 与机制文本一致 | 一致 | cross,pierce |
| CROSS-004 | P0 | handlers 保底裁剪 | 守方同时具备白厄守护或不屈，且多段伤害 | 结算防守 | `cappedHits/hp/log` | 多段总伤害被裁剪为最多掉到1血 | 与文本一致 | 一致 | cross,survival |
| CROSS-005 | P1 | counter 逻辑 | 同回合叠加反击来源（丹恒/仙人球/雨夹雪） | 完成防守结算 | `counterActive/effectEvents` | 由 `counterActive` 通道统一结算，不洞穿且守>攻才反击 | 与机制一致 | 一致 | cross,counter |
| CROSS-006 | P1 | weather.spacetime_storm + gameover | 时空暴触发换血且存在濒死方 | 完成防守结算 | `hp/status/winnerId` | 换血在 `checkGameOver` 前执行，可影响终局 | 与规则一致 | 一致 | cross,hp_swap |
| CROSS-007 | P1 | goNextRound + poison | 回合末中毒足以击杀 | 防守后推进回合 | `hp/status/winnerId/log` | 二次 `checkGameOver` 能捕获回合末死亡 | 与机制一致 | 一致 | cross,poison |
| CROSS-008 | P2 | extraAttackQueued 设计 | 同回合同时满足复读/飓风/流萤连击 | 触发多源连击 | `extraAttackQueued/hits.length` | 现实现为布尔，最多双段攻击 | 文本未定义多源叠加层数 | 待产品确认 | cross,stacking |

## 15. CUSTOM 用例矩阵（自定义角色）

| ID | 优先级 | 基线来源 | 前置状态 | 操作步骤 | 观测字段 | 代码现状断言 | 文本期望断言 | 一致性结论 | 自动化标签 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CUSTOM-001 | P0 | handlers.parseOverrides + registry | 提交合法变体请求 | 调 `handleCreateCustomCharacter` | 返回消息、`custom_characters.json` | 创建成功并广播 `characters_updated` | 与文档一致 | 一致 | custom,create |
| CUSTOM-002 | P0 | handlers | `id` 不符正则 | 提交创建 | 错误消息 | 返回 `角色ID格式错误` | 与文档一致 | 一致 | custom,validation |
| CUSTOM-003 | P0 | handlers | `id` 已存在 | 提交创建 | 错误消息 | 返回重复ID错误 | 与文档一致 | 一致 | custom,validation |
| CUSTOM-004 | P0 | handlers/registry | `baseCharacterId` 不存在 | 提交创建 | 错误消息 | 返回母角色不存在 | 与文档一致 | 一致 | custom,validation |
| CUSTOM-005 | P0 | handlers | 以自定义变体作为母角色 | 提交创建 | 错误消息 | 返回禁止二次继承错误 | 与文档一致 | 一致 | custom,validation |
| CUSTOM-006 | P1 | parseOverrides | overrides 为空或非对象 | 提交创建 | 错误消息 | 返回 overrides 参数错误 | 与文档一致 | 一致 | custom,validation |
| CUSTOM-007 | P1 | parseOverrides | 覆写字段含 `skillText/hooks` | 提交创建 | 错误消息 | 拒绝白名单外字段 | 与文档一致 | 一致 | custom,security |
| CUSTOM-008 | P1 | parseOverrides | `diceSides` 非法（<2/非整数） | 提交创建 | 错误消息 | 拒绝非法面值 | 与文档一致 | 一致 | custom,validation |
| CUSTOM-009 | P1 | parseOverrides | `hp/attackLevel/defenseLevel<=0` 或负数 | 提交创建 | 错误消息 | 约束严格生效 | 与文档一致 | 一致 | custom,validation |
| CUSTOM-010 | P1 | registry.reload | 已创建变体后重启服务 | 重载 registry | `welcome.characters` | 变体可持久加载，且继承母角色 hooks/skillText | 与文档一致 | 一致 | custom,persistence |

## 16. TXT-MIS 用例矩阵（文本一致性专项）

| ID | 优先级 | 基线来源 | 前置状态 | 操作步骤 | 观测字段 | 代码现状断言 | 文本期望断言 | 一致性结论 | 自动化标签 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TXT-MIS-001 | P0 | `bigredbutton.effectText` + 机制说明 | 攻方大红按钮A触发 | 触发背水后继续结算 | `desperateBonus/attackValue/log` | `desperateBonus` 被写入但未参与攻击值计算 | 背水应带来攻击增益 | 不一致 | txt,high_risk |
| TXT-MIS-002 | P0 | 机制说明“力量” | 非风堇角色叠加 `power` | 完成攻击确认 | `power/attackValue` | 当前仅风堇与部分天气消费 `power`，其他角色不生效 | 文本语义易理解为全局攻击加成 | 不一致 | txt,high_risk |
| TXT-MIS-003 | P0 | 机制说明“超载” | 贷款A叠层后分别攻防 | 先攻后守多轮 | `overload/attackValue/hp` | 仅见防守自伤，未见攻击增益消费 | 文本/机制摘要存在“攻方收益”语义 | 不一致 | txt,high_risk |
| TXT-MIS-004 | P0 | `MECHANISMS_AND_TESTS.md` vs `server/weather.js` | 读取机制文档与代码 | 对照检查 | 文档内容、代码行为 | 代码已完整实现天气逻辑 | 旧文档段落仍称“天气未实现” | 不一致 | txt,high_risk,doc |
| TXT-MIS-005 | P1 | `WEATHER_SYSTEM_SPEC.md` vs 代码 | 对照“文档先行、不改实现”措辞 | 检查天气链路 | 文档与代码 | 代码已接入 handlers 主流程 | 规范文档声明与现状存在时间差 | 待产品确认 | txt,doc |
| TXT-MIS-006 | P2 | `repeater.js` | 复读防守阶段可达性 | 尝试防守使用复读 | `error/role/hooks` | `canUse` 限制攻击，`onDefense` hook 在常规流程不可达 | 文本未声明防守可触发 | 待产品确认 | txt,dead_path |
| TXT-MIS-007 | P2 | `starshield.js` | 星盾攻击阶段可达性 | 尝试攻击使用星盾 | `error/role/hooks` | `canUse` 限制防守，`onAttack` hook 在常规流程不可达 | 文本仅写防守可用 | 待产品确认 | txt,dead_path |
| TXT-MIS-008 | P2 | `xilian.skillText` 与日志文案 | 昔涟触发阈值 | 检查日志文本 | `attackLevel/log` | 实际只改 `attackLevel` | 日志含“攻击防等级变为5”字样 | 不一致（文案级） | txt,copy |

## 17. 已识别高风险不一致（先行阻塞项）

1. `TXT-MIS-001`：大红按钮背水加成未进入攻击值计算（P0）。
2. `TXT-MIS-002`：力量是否全局生效语义冲突（P0）。
3. `TXT-MIS-003`：超载仅防守自伤，攻击侧消费缺失（P0）。
4. `TXT-MIS-004`：机制总表与代码的天气实现状态冲突（P0）。

## 18. 回归与准入标准

### 18.1 优先级定义

1. `P0`：阻塞上线。失败即判定不可发布。
2. `P1`：高风险。允许临时豁免，但必须有 issue 与修复计划。
3. `P2`：中低风险。可在后续迭代修复。

### 18.2 准入门槛

1. 所有 `P0` 用例通过率必须 100%。
2. `P1` 用例通过率必须 >= 95%，未通过需明确豁免记录。
3. 所有 `TXT-MIS` 用例必须有结论与处理动作（改代码/改文档/待确认）。
4. 所有依赖随机的通过用例必须包含随机控制声明。

### 18.3 回归执行建议

1. 每次修改 `handlers/skills/weather/entities/dice/registry` 后至少执行：`FLOW-SRV + CROSS + 相关角色/曜彩/天气子集`。
2. 发布前执行全量矩阵。
3. 若新增角色/曜彩/天气，必须同步新增对应 `CHAR/AURORA/WEATHER/TXT-MIS` 用例。

## 19. 默认假设

1. 文档语言为中文，术语与字段名保持代码命名一致。
2. 本轮只产出测试文档，不修改服务端业务代码。
3. 本文档不覆盖客户端、AI、联机网络层专项。
4. 一致性冲突默认先以“代码现状可复现”落测试，再标注待确认项。
