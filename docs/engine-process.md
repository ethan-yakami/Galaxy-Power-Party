# Battle Engine 结算流程说明

本文基于当前 `src/core/battle-engine/reducer.js` 与 `src/core/battle-engine/rules/weather.js` 的实际执行顺序整理，方便定位 phase 迁移、触发顺序、伤害优先级和状态清理时机。

## 1. Phase 状态机

```mermaid
stateDiagram-v2
  [*] --> "attack_roll"
  "attack_roll" --> "attack_reroll_or_select": "ROLL_ATTACK"
  "attack_reroll_or_select" --> "attack_reroll_or_select": "USE_AURORA_ATTACK / REROLL_ATTACK"
  "attack_reroll_or_select" --> "defense_roll": "CONFIRM_ATTACK"
  "attack_reroll_or_select" --> "ended": "CONFIRM_ATTACK + game over"
  "defense_roll" --> "defense_select": "ROLL_DEFENSE"
  "defense_select" --> "defense_select": "USE_AURORA_DEFENSE"
  "defense_select" --> "attack_roll": "CONFIRM_DEFENSE + next round"
  "defense_select" --> "ended": "CONFIRM_DEFENSE + game over"
  "ended" --> [*]
```

## 2. 核心结算顺序

### `CONFIRM_ATTACK`

1. 校验选骰数量、去重和命运骰约束。
2. 执行角色升阶与攻击前 hooks。
3. 写入 `attackSelectionMask`，计算基础 `attackValue`。
4. 叠加全局攻击修正、角色主攻击 hook、曜彩攻击侧效果。
5. 执行天气攻击侧 hook。
6. 检查是否提前结束；否则进入 `defense_roll`。

### `CONFIRM_DEFENSE`

1. 校验选骰数量、去重和命运骰约束。
2. 执行角色升阶与防御前 hooks。
3. 写入 `defenseSelectionMask`，计算基础 `defenseValue`。
4. 执行角色主防御 hook、曜彩防御侧效果、骇入修正、天气防御侧 hook。
5. 处理超载自伤、荆棘自伤、主伤害、连击、力场、保底、生效后置效果。
6. 执行反击与回合结束检查；若未结束则进入下一回合。

## 3. 伤害优先级

1. 防御侧即时自伤：超载、荆棘。
2. 主伤害：洞穿时直接吃攻击值，否则 `max(attack - defense, 0)`。
3. 分段命中：连击拆段后逐段应用力场、保底、事件日志。
4. 后置 effects：角色 `onDamageApplied`、攻击方后置、守方后置、天气后置。
5. 反击：满足条件时再对攻击方结算。
6. 回合末效果：中毒、天气换阶段、状态回收。

## 4. 状态清理时机

- `ROLL_ATTACK`：重置本轮攻防缓存、选骰和伤害快照。
- `goNextRound`：交换攻防方并清理本回合临时状态，如 `counterActive`、`roundAuroraUsed`、`yaoguangRerollsUsed`。
- `applyThornsDamage`：结算后立即清空荆棘。
- `updateWeatherForNewRound`：清理回合型天气增益，并在阶段切换时回收阶段型加成。

## 5. 代码入口

- 主 reducer：`src/core/battle-engine/reducer.js`
- 天气规则：`src/core/battle-engine/rules/weather.js`
- 状态定义：`src/core/battle-engine/state.js`
- Legacy 投影：`src/core/battle-engine/projector.js`
