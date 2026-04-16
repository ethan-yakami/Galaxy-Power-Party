# 机制总表与自动化测试矩阵

## 1. 机制总览

### 1.1 回合阶段（Server Authoritative）

`room.game.phase` 关键阶段：

1. `attack_roll`：攻击方投掷普通骰（可追加曜彩骰）
2. `attack_reroll_or_select`：攻击方重投或选骰确认
3. `defense_roll`：防守方投掷普通骰（可追加曜彩骰）
4. `defense_select`：防守方选骰确认并结算
5. `ended`：对局结束

### 1.2 核心状态字段（节选）

- 攻防与流程：`attackerId/defenderId/phase/rerollsLeft/round`
- 骰子与选取：`attackDice/defenseDice/attackSelection/defenseSelection/attackPreviewSelection/defensePreviewSelection`
- 值与伤害：`attackValue/defenseValue/attackPierce/lastDamage/hp/maxHp`
- 角色面板：`attackLevel/defenseLevel/diceSidesByPlayer/auroraUsesRemaining`
- 特殊状态：`forceField/poison/resilience/thorns/power/hackActive/counterActive/unyielding/desperateBonus/overload/extraAttackQueued`
- 统计计数：`selectedFourCount/selectedOneCount/cumulativeDamageTaken/auroraAEffectCount`
- 结果与日志：`winnerId/log/effectEvents`

### 1.3 结算顺序（关键链路）

攻击确认阶段关键顺序：

1. 校验攻击选骰合法性（含命定约束）
2. 角色跃升与攻击前技能处理
3. 计算 `attackValue`
4. 角色 `onMainAttackConfirm`
5. 曜彩骰攻击侧 A 效果（`applyAuroraAEffectOnAttack`）
6. `checkGameOver`
7. 进入防守投骰阶段

防守确认阶段关键顺序：

1. 校验防守选骰合法性（含命定约束）
2. 角色跃升与防守钩子处理
3. 计算 `defenseValue`
4. 曜彩骰防守侧 A 效果（`applyAuroraAEffectOnDefense`）
5. 骇入/超载/荆棘等即时影响
6. 攻防差值伤害结算（含力场、洞穿、连击）
7. 反击结算
8. `checkGameOver`
9. 回合推进（含中毒回合末结算）

## 2. 角色机制表

说明：以下为当前基础角色池（不含 `_TEMPLATE.js`）。角色技能由 `hooks` 触发，详细逻辑在各角色实体文件与 `server/handlers.js`/`server/skills.js`。

| id | name | hp | diceSides | auroraUses | attackLevel | defenseLevel | maxAttackRerolls | 关键 hooks |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| baie | 白厄 | 20 | [8,8,6,6,6] | 2 | 4 | 2 | 2 | `onDefenseConfirm/onAttackAfterDamageResolved` |
| daheita | 大黑塔 | 42 | [8,8,6,6,6] | 2 | 3 | 2 | 2 | `shouldAscend/onRoundEnd` |
| danheng | 丹恒·腾荒 | 25 | [8,8,6,6,6] | 2 | 3 | 2 | 2 | `onDefenseRoll/onMainAttackConfirm/onAfterDamageResolved` |
| fengjin | 风堇 | 28 | [8,6,6,6,6] | 2 | 2 | 2 | 2 | `onMainAttackConfirm/onAttackAfterDamageResolved` |
| huangquan | 黄泉 | 33 | [8,6,4,4,4] | 2 | 2 | 3 | 2 | `onAttackConfirm/aiFilterReroll` |
| huohua | 火花 | 22 | [8,6,6,4,4] | 2 | 4 | 3 | 2 | `onAttackConfirm/onDefenseConfirm` |
| kafuka | 卡芙卡 | 30 | [6,6,4,4,4] | 2 | 4 | 3 | 2 | `onAttackConfirm/onAfterDamageResolved` |
| liuying | 流萤 | 28 | [6,6,6,4,4] | 2 | 4 | 3 | 2 | `onAttackConfirm/onMainAttackConfirm` |
| sanyueqi | 三月七 | 25 | [6,6,4,4,4] | 2 | 4 | 3 | 2 | `onMainAttackConfirm/onDefenseConfirm` |
| shajin | 砂金 | 33 | [8,6,6,6,4] | 2 | 4 | 2 | 2 | `onAttackConfirm/onMainDefenseConfirm` |
| xiadie | 遐蝶 | 27 | [8,8,6,4,4] | 2 | 3 | 2 | 2 | `onDamageApplied` |
| xilian | 昔涟 | 30 | [8,6,6,6,4] | 2 | 3 | 2 | 2 | `shouldAscend/onMainAttackConfirm/onMainDefenseConfirm` |
| yaoguang | 爻光 | 35 | [8,8,6,6,6] | 2 | 3 | 2 | 4 | `onReroll/onMainAttackConfirm` |
| zhigengniao | 知更鸟 | 30 | [6,6,4,4,4] | 0 | 4 | 3 | 2 | `onAttackConfirm/aiFilterReroll` |

补充：

- 自定义角色通过 `src/content/entities/custom_characters.json` 叠加，机制继承母角色（不允许覆写 hooks/skillText）。
- 当前示例自定义角色：`yaoguang_v2`、`xilian_v2`。

## 3. 曜彩骰机制表

说明：以下为基础曜彩骰池（不含 `_TEMPLATE.js`）。`A` 表示该面带 A 效果触发标记。

| id | name | 面值分布 | 条件 | 效果摘要 | hooks |
| --- | --- | --- | --- | --- | --- |
| berserker | 战狂 | 4,4,8A,8A,12A,12A | 随时可用 | A触发获荆棘 | `onAttack/onDefense` |
| bigredbutton | 大红按钮 | 6A,6A,6A,8A,8A,8A | 回合>=5且攻击可用 | A触发背水 | `canUse/onAttack` |
| cactus | 仙人球 | 4A,5A,6A,7A,8A,9A | 仅防守可用 | A触发反击 | `canUse/onDefense` |
| destiny | 命运 | 1A,3A,3A,12A,12A,16A | 随时可用 | A触发并附带命定约束 | `onAttack/onDefense` |
| evolution | 进化 | 3,3,4,4,6,2A | 随时可用 | A触发翻倍 | `onAttack/onDefense` |
| gambler | 赌徒 | 1,1,6,8,10,12 | 前4回合可用 | 无A效果 | `canUse` |
| heartbeat | 心跳 | 1,1,1,1,9A,9A | 随时可用 | A触发回充曜彩次数 | `onAttack/onDefense` |
| legacy | 遗语 | 4,5,5,1A,2A,4A | 生命<=8可用 | A触发翻倍 | `canUse/onAttack/onDefense` |
| loan | 贷款 | 2A,2A,3A,3A,4A,4A | 随时可用 | A触发超载层数 | `onAttack/onDefense` |
| magicbullet | 魔弹 | 3,5,7,3A,5A,7A | 随时可用 | A触发瞬伤 | `onAttack/onDefense` |
| medic | 医嘱 | 1A,2A,3A,4A,6A,6A | 随时可用 | A触发治疗 | `onAttack/onDefense` |
| miracle | 奇迹 | 99,99,99,99,99,99 | 累计选到1点达到阈值 | 无A效果 | `canUse` |
| oath | 誓言 | 8,8,4A,4A,6A,6A | 仅防守可用 | A触发不屈 | `canUse/onDefense` |
| prime | 质数 | 5,5,5,7,7,7 | 随时可用 | 无A效果 | 无 |
| repeater | 复读 | 1,1,4,4,4A,4A | 累计选4达到阈值（攻击） | A触发连击 | `canUse/onAttack/onDefense` |
| revenge | 复仇 | 6,6,8,8,12,12 | 累计受伤达到阈值（攻击） | 无A效果 | `canUse` |
| sixsix | 6·6 | 6,6,6,6,6,6 | 随时可用 | 无A效果 | 无 |
| starshield | 星盾 | 7,7,7,1A,1A,1A | 仅防守可用 | A触发力场 | `canUse/onAttack/onDefense` |
| trickster | 奇术师 | 4,4,4,4A,6A,6A | 随时可用 | A触发骇入 | `onAttack/onDefense` |

## 4. 骰子系统机制

来源：`server/dice.js`。

### 4.1 骰子对象结构

- 普通骰：`value/label/hasA=false/isAurora=false/sides/maxValue/slotId`
- 曜彩骰：`value/label/hasA/isAurora=true/auroraId/auroraName/effectText/conditionText/maxValue`

### 4.2 核心规则

- 普通骰生成：`makeNormalDiceFromPool(diceSides)`，每个面独立随机 `1..sides`
- 曜彩骰生成：`rollAuroraFace(auroraId)` 从对应面池随机抽取
- 重投：
  - 普通骰重投同边数
  - 曜彩骰重投等价为重新抽该曜彩骰面
- 排序：按 `value` 升序；同值普通骰优先于曜彩骰
- 取值：`sumByIndices` 直接按索引求和
- 索引校验：
  - `isValidDistinctIndices`：必须固定数量且互不重复
  - `isValidDistinctIndicesAnyCount`：任意数量但互不重复

### 4.3 攻击重投索引去重

- 服务端攻击重投会先校验范围，再按原顺序去重。
- 同一索引重复提交只执行一次重投。

## 5. 天气机制

### 5.1 当前状态

- 当前版本已实现天气系统，并已接入房间状态同步、对局流程与结算钩子。
- 服务端会维护 `game.weather` / `weatherState`，并通过 `room_state.room.game.weather` 向客户端同步当前天气信息。

### 5.2 现有接口与扩展方向

- 当前状态字段：`game.weather`、`game.weatherState`
- 当前触发时机：
  - `onStageEnter`
  - `onRoundStart`
  - `onAttackSelect`
  - `onDefenseSelect`
  - `onAfterDamageResolved`
  - `onStageExit`
- 当前同步协议：
  - `welcome.weatherCatalog`
  - `room_state.room.game.weather`

### 5.3 天气测试占位说明

- 天气相关自动化测试ID统一放在第 7.8 节，避免与其他章节重复。
- 第 7.8 节用于覆盖天气实现与文档的一致性回归。

### 5.4 天气规则修订摘要（文档与代码已同步）

- 详细规范见：[WEATHER_SYSTEM_SPEC.md](/C:/Users/user/Desktop/Galaxy-Power-Party-master/WEATHER_SYSTEM_SPEC.md)
- 本轮确认的4条规则：
  - `幻日`：重投时施加 2 层荆棘（按重投动作触发，复用 `game.thorns`）。
  - `雷雨`：选骰确认时生效；攻击确认攻方攻击值 +4，防守确认守方防守值 +4。
  - `烈日(虹吸)`：与白厄一致；伤后回复 `floor(伤害*0.5)`，且回复不超过 `maxHp`。
  - `晴雷`：凝伤定义为瞬伤，走 `instant_damage` 事件。
- 以上规则已经接入当前服务端实现，并以 `room_state.room.game.weather` 对外同步。

## 6. 联机同步机制

### 6.1 WebSocket关键消息

- 房间与对局：`create_room/join_room/create_ai_room/leave_room/play_again/disband_room`
- 角色配置：`choose_character/choose_aurora_die`
- 对局动作：`roll_attack/reroll_attack/confirm_attack_selection/roll_defense/confirm_defense_selection/use_aurora_die/update_live_selection`
- 自定义角色：`create_custom_character`
- 服务端推送：`welcome/room_state/error/left_room/characters_updated/custom_character_created`

### 6.2 同步规则

- 服务端权威：客户端不保存真实裁决状态，仅渲染 `room_state`。
- 自定义角色创建成功后，服务端广播 `characters_updated`，在线客户端实时刷新角色池。
- 大厅阶段对手配置可隐藏；进入 `in_game` 后双方可见完整对局信息。

## 7. 自动化测试矩阵

说明：以下测试ID全局唯一，便于直接转脚本。

### 7.1 FLOW-*（流程）

| 测试ID | 前置条件 | 操作 | 预期断言 |
| --- | --- | --- | --- |
| FLOW-001 | A/B已连线 | A建房B加房，双方完成角色与曜彩选择 | 自动进入`in_game`且`phase=attack_roll` |
| FLOW-002 | `attack_roll` | 攻击方`roll_attack` | 进入`attack_reroll_or_select`并生成`attackDice` |
| FLOW-003 | `defense_roll` | 防守方`roll_defense` | 进入`defense_select`并生成`defenseDice` |
| FLOW-004 | `defense_select` | 防守方确认后完成结算 | 回合+1，攻防互换，`phase=attack_roll` |
| FLOW-005 | 任意结算后hp<=0 | 触发击杀 | `status=ended`且`winnerId`存在 |
| FLOW-006 | 双方同回合归零 | 完成结算 | 按当前规则判攻击方胜（日志可见） |

### 7.2 ROLE-*（角色）

| 测试ID | 前置条件 | 操作 | 预期断言 |
| --- | --- | --- | --- |
| ROLE-001 | 爻光为攻击方 | 使用重投 | `onReroll`生效，相关计数变化 |
| ROLE-002 | 昔涟达成跃升条件 | 进行选骰确认 | `shouldAscend`生效，最小骰提升 |
| ROLE-003 | 丹恒防守回合 | 触发反击准备并结算 | 可观察到反击相关日志与伤害 |
| ROLE-004 | 黄泉攻击 | 选骰确认 | 洞穿判定符合角色技能 |
| ROLE-005 | 遐蝶受击 | 完成结算 | `onDamageApplied`被调用，状态正确更新 |
| ROLE-006 | 知更鸟(auroraUses=0) | 大厅准备开局 | 不强制选曜彩也可开局 |

### 7.3 DICE-*（骰子）

| 测试ID | 前置条件 | 操作 | 预期断言 |
| --- | --- | --- | --- |
| DICE-001 | `attack_reroll_or_select` | `indices=[1,1,3,3]`重投 | 仅索引1/3各重投一次，`rerollsLeft`仅减1 |
| DICE-002 | `attack_reroll_or_select` | 提交越界索引 | 返回`error`且状态不变 |
| DICE-003 | 攻击确认 | 重复索引确认攻击 | 返回`error` |
| DICE-004 | 命运曜彩在池中 | 确认攻击时不选命定骰 | 返回`error` |
| DICE-005 | 混合普通骰/曜彩骰 | 执行排序 | 同值时普通骰排在曜彩骰前 |

### 7.4 AURORA-*（曜彩）

| 测试ID | 前置条件 | 操作 | 预期断言 |
| --- | --- | --- | --- |
| AURORA-001 | 攻击阶段可用曜彩 | `use_aurora_die`后确认带A面 | 攻击侧A效果触发并记入日志 |
| AURORA-002 | 防守阶段可用曜彩 | `use_aurora_die`后确认带A面 | 防守侧A效果触发并记入日志 |
| AURORA-003 | 曜彩次数耗尽 | 再次使用曜彩 | 返回`error` |
| AURORA-004 | 星盾在攻击阶段 | 使用曜彩 | 被条件拒绝（只能防守） |
| AURORA-005 | 贷款A触发后防守 | 完成防守结算 | 存在超载自伤结算 |

### 7.5 SYNC-*（联机同步）

| 测试ID | 前置条件 | 操作 | 预期断言 |
| --- | --- | --- | --- |
| SYNC-001 | A/B同房间 | A更新实时选骰 | B收到`room_state`中preview同步 |
| SYNC-002 | A/B同房间大厅 | A切换角色 | B收到大厅状态更新 |
| SYNC-003 | A创建自定义角色 | 服务端广播 | B收到`characters_updated`并能看到新角色 |
| SYNC-004 | 房间中一方离开 | 触发`leave_room` | 对方收到`left_room`或房间更新 |

### 7.6 CUSTOM-*（自定义角色）

| 测试ID | 前置条件 | 操作 | 预期断言 |
| --- | --- | --- | --- |
| CUSTOM-001 | 工坊已连接 | 提交合法变体 | 收到`custom_character_created` |
| CUSTOM-002 | 工坊已连接 | 提交重复`id` | 返回`error` |
| CUSTOM-003 | 工坊已连接 | 提交非法覆写字段（如`skillText`） | 返回`error` |
| CUSTOM-004 | 工坊已连接 | 提交非法`diceSides` | 返回`error` |
| CUSTOM-005 | 已创建变体 | 重启服务 | `welcome.characters`仍包含该变体 |

### 7.7 AI-*（AI）

| 测试ID | 前置条件 | 操作 | 预期断言 |
| --- | --- | --- | --- |
| AI-001 | 存在自定义变体 | 连续创建多局AI房采样 | AI角色不命中`isCustomVariant=true` |
| AI-002 | 基础角色池非空 | 正常创建AI房 | AI能成功随机到基础角色并开局 |

### 7.8 WEATHER-*（天气规范一致性 + 基线）

| 测试ID | 前置条件 | 操作 | 预期断言 |
| --- | --- | --- | --- |
| WEATHER-001 | 当前主干版本 | 正常跑完整局 | 无天气字段依赖，流程稳定 |
| WEATHER-002 | 构造未知`game.weather`字段 | 进行攻防结算 | 不影响主流程、不抛异常 |
| WEATHER-003 | 已有天气规范文档 | 检查`幻日`定义 | 仅出现“荆棘”映射，不再出现“割痕”旧定义 |
| WEATHER-004 | 已有天气规范文档 | 检查`雷雨`定义 | 触发点为`onAttackSelect/onDefenseSelect`，且固定为攻+4/守+4 |
| WEATHER-005 | 已有天气规范文档 | 检查`烈日`定义 | 明确为白厄同款虹吸：`floor(伤害*0.5)`并受`maxHp`上限约束 |
| WEATHER-006 | 已有天气规范文档 | 检查`晴雷`定义 | 明确为瞬伤（`instant_damage`），非攻防差值伤害 |
| WEATHER-007 | 已有天气规范文档 | 搜索过期TODO关键词 | 不存在`TODO(虹吸)`与`TODO(凝伤)` |
| WEATHER-008 | 天气规范与总表并存 | 交叉检查两文档 | 两文档语义一致且均标记天气已上线 |

## 8. 已知风险与覆盖缺口

- 代码中存在部分历史中文字符串编码异常，日志断言建议优先匹配状态字段而非全文本。
- 当前仓库无统一测试框架（如 Jest/Mocha）；上述矩阵建议先用 WS 脚本化回归。
- 天气机制尚未实现；当前已补充天气规范文档，需后续按规范落代码并补实战回归。
- 文档已覆盖角色/骰子/天气与联机同步，但前端动画类视觉效果未纳入自动断言。
