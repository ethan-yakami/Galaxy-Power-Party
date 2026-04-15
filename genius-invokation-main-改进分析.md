# 基于 `genius-invokation-main` 的改进分析（面向 Galaxy Power Party）

## 1. 分析目标
本报告用于参考 `genius-invokation-main`（以下简称 **GI 项目**）的工程实践，评估 **银河战力党（Galaxy Power Party）** 当前架构可改进点，并给出按优先级可落地的实施建议。

## 2. GI 项目可借鉴的工程特征（已观察）

### 2.1 多包拆分与职责清晰
- 使用 monorepo + `packages/*` 组织（核心、数据、服务端、Web UI、测试、工具链、跨语言绑定等）。
- 典型优势：边界明确、可独立演进、复用能力强。

### 2.2 测试体系规模化
- 有独立 `@gi-tcg/test` 包，覆盖大量规则/卡牌行为用例。
- root 可统一执行测试（`bun run test`），包内也有 `check/test/build`。

### 2.3 协议与类型生成链路
- 使用 `proto/*.proto` + `buf.gen.yaml`，生成 TS/Python/C# 协议代码。
- 对跨端通信格式有更强约束，降低“前后端字段偏差”风险。

### 2.4 CI/CD 与质量门禁
- GitHub Actions 中包含构建、测试、产物上传、发布、多平台构建。
- 启用 CodeQL 安全扫描，形成持续质量检查。

### 2.5 配套开发文档与工具包
- 有 `docs/development/*` 的流程/状态设计文档。
- 有日志查看、状态编辑、数据查看等工具型包，便于调试和回归验证。

## 3. 你当前项目现状（用于对比）
- 优点：
- 已有较清晰的服务端模块（`src/server/*`）与前端模块（`src/client/js/*`）。
  - 已存在协议规范化入口（`server/protocol/messages.js`）。
  - 已有可执行测试脚本（如 `test:battle-engine`、`test:protocol`、`test:connection-fsm`、`test:replay-history`）。
- 已有回放相关模块（`src/core/shared/replay-schema.js`、`src/client/js/replay-history.js`、`src/server/services/replay.js`）。
- 短板（相较 GI 项目）：
  - 缺少统一 CI 自动化门禁（当前仓库未见 `.github/workflows`）。
  - 测试入口分散，缺少一条“全量测试”标准命令。
  - 协议字段仍以手写约定为主，缺少可自动校验/生成的 schema 流程。
  - 规则/技能新增后的回归保障，仍偏人工驱动。

## 4. 改进建议（按优先级）

## P0（建议先做，1~2 周）

### P0-1 建立最小 CI 质量门禁
目标：每次 PR 自动跑基础质量检查，避免回归。

建议落地：
- 新增 GitHub Actions `ci.yml`（Node 18/20）。
- 流程至少包含：
  - `npm ci`
  - `npm run test:battle-engine`
  - `npm run test:protocol`
  - `npm run test:connection-fsm`
  - `npm run test:replay-history`

收益：
- 把“能不能合并”从主观判断变成客观结果。

### P0-2 增加统一测试入口
目标：本地和 CI 执行路径一致。

建议落地：
- 在根 `package.json` 增加：
  - `"test": "npm run test:battle-engine && npm run test:protocol && npm run test:connection-fsm && npm run test:replay-history"`

收益：
- 降低维护成本，减少漏跑测试。

### P0-3 协议校验再前移一步
目标：在消息进入 handler 前完成强约束校验。

建议落地：
- 在现有 `server/protocol/messages.js` 基础上，为关键消息类型建立 payload schema（可先用轻量 JSON Schema 或手写 validator map）。
- 将 `type -> validator` 映射集中维护，并输出统一错误码。

收益：
- 明显降低异常输入导致的分支复杂度和线上隐患。

## P1（建议随后做，2~4 周）

### P1-1 规则回归测试矩阵化
目标：新增角色/光环骰时，不再依赖纯手测。

建议落地：
- 按“角色技能 + 光环 + 回合阶段”建立表驱动测试样例。
- 把已有 `battle-engine` 测试拆成“通用规则测试 + 机制专项测试 + 回放一致性测试”。

收益：
- 机制扩展速度更快，且不会把旧逻辑改坏。

### P1-2 结算流程文档化（流程图+状态转移）
目标：新开发者能快速理解复杂机制。

建议落地：
- 新增 `docs/engine-process.md`，明确：
  - phase 迁移
  - 触发顺序
  - 伤害结算优先级
  - 特殊状态清理时机

收益：
- 维护风险下降，review 成本更低。

### P1-3 回放协议版本策略
目标：未来改协议不破坏旧回放文件。

建议落地：
- 在 `ReplayV1` 基础上预留 `migrateReplay(version, payload)`。
- 每次结构变化都通过迁移函数兼容。

收益：
- 避免“版本升级后旧对局无法复盘”。

## P2（可选，团队扩大再做）

### P2-1 轻量“伪 monorepo”拆分
目标：在不引入复杂构建系统前提下，先清晰边界。

建议落地：
- 先做目录级拆分（例如 `engine/`、`server/`、`client/`、`tools/`），保持 npm 单包。
- 当多人并行开发明显增多时，再考虑真正 workspace 化。

收益：
- 避免一步到位重构带来的高风险。

### P2-2 Proto/代码生成（按需）
目标：仅在多客户端/跨语言需求出现时引入。

建议落地：
- 如果后续要做桌面端、移动端或外部 SDK，再评估 `proto + codegen`。

收益：
- 保持当前项目轻量，不提前承担复杂度。

## 5. 推荐执行路线（最务实版本）
1. 先做 CI + 统一 `npm test`（当天可起步，收益最大）。
2. 再做消息 schema 校验（1~2 天即可显著降错）。
3. 然后把 battle-engine 测试按机制模块化（持续迭代）。
4. 最后补流程文档与回放迁移策略，形成长期可维护基础。

## 6. 结论
`genius-invokation-main` 的核心启发不是“照搬大体量架构”，而是三件事：
- 把规则正确性前置到自动化测试；
- 把通信格式前置到协议约束；
- 把质量控制前置到 CI 门禁。

对你当前项目来说，最优策略是：**先做轻量但高收益的工程化升级（P0/P1），暂不做重型改造（P2）**。
