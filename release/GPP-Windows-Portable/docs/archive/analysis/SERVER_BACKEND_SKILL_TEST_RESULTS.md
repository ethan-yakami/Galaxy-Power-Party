# 服务端技能结算与文本一致性专项测试结果

- 测试基线文档：[SERVER_BACKEND_SKILL_TEST_DOC.md](/C:/Users/user/Desktop/Galaxy-Power-Party-master/SERVER_BACKEND_SKILL_TEST_DOC.md)
- 测试执行时间：2026-04-09（Asia/Shanghai）
- 执行方式：服务端白盒（内存 `rooms` + mock `ws` + 直接调用 handlers/hooks）
- 执行脚本：[run_backend_skill_doc_tests.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/scripts/run_backend_skill_doc_tests.js)
- 原始结果 JSON：[backend_skill_test_results.json](/C:/Users/user/Desktop/Galaxy-Power-Party-master/tmp/backend_skill_test_results.json)

## 1. 执行命令

```powershell
node scripts/run_backend_skill_doc_tests.js
```

执行输出：

- `total=107`
- `pass=107`
- `fail=0`

## 2. 总体结论

1. 本轮“服务端核心结算链路 + 角色技能 + 曜彩机制 + 天气 + 跨机制 + 文本不一致 + 自定义角色校验”已完成全量自动化回归。
2. 所有 107 条用例已通过，无失败项。
3. 文本一致性高风险项（`TXT-MIS`）已成功复现，结论与专项文档一致。

## 3. 分组结果

| 分组 | 计划矩阵规模（文档） | 本轮执行 | 通过 | 失败 | 通过率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| FLOW-SRV | 12 | 12 | 12 | 0 | 100% |
| CHAR | 14 | 14 | 14 | 0 | 100% |
| AURORA | 19 | 19 | 19 | 0 | 100% |
| WEATHER | 36 | 36 | 36 | 0 | 100% |
| CROSS | 8 | 8 | 8 | 0 | 100% |
| CUSTOM | 10 | 10 | 10 | 0 | 100% |
| TXT-MIS | 8 | 8 | 8 | 0 | 100% |
| 合计 | 107 | 107 | 107 | 0 | 100% |

说明：本轮为全量执行，不存在未执行条目。

## 4. 失败项详情

本轮无失败项。

## 5. 关键验证结果（通过）

1. FLOW：
   - 攻防阶段推进、重投去重、命定强制选骰、索引校验、同归于尽判定均通过。
2. CHAR（14/14）：
   - 14 名基础角色核心钩子行为均通过最小正向验证。
3. AURORA（19/19）：
   - 19 个曜彩骰的条件与 A 效果关键行为均通过最小验证。
4. WEATHER（36/36）：
   - 阶段切换、27 张天气卡关键行为、清理与约束路径均通过。
5. TXT-MIS（8/8）：
   - `desperateBonus` 未参与攻击值
   - `power` 非全局生效
   - `overload` 攻防语义缺口
   - 机制文档天气实现状态与代码不一致
   - 复读/星盾不可达路径与昔涟日志文案问题
   - 以上均可稳定复现。

## 6. 产物与追溯

1. 测试脚本：
   - [run_backend_skill_doc_tests.js](/C:/Users/user/Desktop/Galaxy-Power-Party-master/scripts/run_backend_skill_doc_tests.js)
2. 原始结果：
   - [backend_skill_test_results.json](/C:/Users/user/Desktop/Galaxy-Power-Party-master/tmp/backend_skill_test_results.json)
3. 本结果文档：
   - [SERVER_BACKEND_SKILL_TEST_RESULTS.md](/C:/Users/user/Desktop/Galaxy-Power-Party-master/SERVER_BACKEND_SKILL_TEST_RESULTS.md)

## 7. 下一步建议

1. 将 `FLOW-SRV-012` 的修复行为（`play_again` 后停留 `lobby`）同步到对外变更说明。
2. 后续新增机制时，沿用当前全量脚本继续回归，保持 100% 通过率。
