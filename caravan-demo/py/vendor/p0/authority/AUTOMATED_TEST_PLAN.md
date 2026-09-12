> 最终合并版；基线v0.3及用户授权增量；交付修订2026-09-09。来源修正及合并记录见MERGE_REPORT.md。
> 来源：[小游戏设计](chatgpt-conversation://6a9c199c-cc30-83ed-b798-d1cb0b3d7388)，turn `9524959c-99ea-4a7c-ae7e-e06f278e9598` 及本次用户明确约束。来源差异见 MERGE_REPORT.md。

# `AUTOMATED_TEST_PLAN.md`
## DUNHUANG_CARAVAN_LOADING v0.3

## 1. 测试目标

自动测试必须验证五类核心系统：

1. **Cargo / Bag 基础逻辑**
2. **StackingScore**
3. **BalanceScore / LayoutScore / Performance**
4. **Generator / QA**
5. **Settlement / TRIAL / ABORTED / Time**

核心原则：

> **同一个 `evaluateLayout()` 必须同时用于玩家提交、题面求解、自动测试和 Debug。**

不能生成器一套算法、玩家结算另一套算法。

---

# 2. Cargo / Bag 基础逻辑测试

### TEST-BAG-001｜自动落入最低空位

初始：

```text
LeftBag = [empty, empty, empty, empty]
```

依次放入：

```text
银器
纸张
胡椒
```

预期：

```text
L1 = 银器
L2 = 纸张
L3 = 胡椒
L4 = empty
```

PASS 条件：

> 顺序严格由放入先后决定。

---

### TEST-BAG-002｜不能跳层

当：

```text
L1 occupied
L2 empty
L3 empty
L4 empty
```

下一件货只能进入：

```text
L2
```

不得进入 L3/L4。

---

### TEST-BAG-003｜每袋最多4件

已有：

```text
L1-L4 occupied
```

再尝试放入左袋：

预期：

```text
placement rejected
```

不得覆盖任何已有货物。

---

### TEST-BAG-004｜只能取出顶层

如果：

```text
L1 = 银器
L2 = 胡椒
L3 = 纸张
```

点击：

```text
纸张
```

→ 可以取出。

点击：

```text
银器 / 胡椒
```

→ 不可取出。

预期提示：

> `先取出上层货物`

---

### TEST-BAG-005｜取出后返回 Waiting Area

取出 L3 后：

```text
L3 = empty
cargo returned to waiting area
```

下一件放入时重新占据 L3。

---

# 3. StackingScore 测试

这一组必须直接验证每一条扣分规则。

## Heavy Layer Penalty

### TEST-STK-001
重货位于 L1：

```text
penalty = 0
```

### TEST-STK-002
重货位于 L2：

```text
penalty = -5
```

### TEST-STK-003
重货位于 L3：

```text
penalty = -12
```

### TEST-STK-004
重货位于 L4：

```text
penalty = -20
```

---

# 4. 怕压货测试

### TEST-STK-005｜weightAbove 0–1

纸张上方只有胡椒1：

```text
pressure penalty = 0
```

---

### TEST-STK-006｜weightAbove 2–3

纸张上方总重3：

```text
penalty = -8
```

---

### TEST-STK-007｜weightAbove 4–5

纸张上方总重5：

```text
penalty = -18
```

---

### TEST-STK-008｜weightAbove 6–8

纸张上方总重8：

```text
penalty = -28
```

---

### TEST-STK-009｜weightAbove ≥9

纸张上方总重9：

```text
penalty = -38
```

---

# 5. 易损货测试

### TEST-STK-010

易损货第1层：

```text
layer penalty = 0
```

### TEST-STK-011

易损货第2层：

```text
layer penalty = 0
```

### TEST-STK-012

易损货第3层：

```text
layer penalty = -6
```

### TEST-STK-013

易损货第4层：

```text
layer penalty = -12
```

### TEST-STK-014

易损货上方存在 HEAVY：

```text
additional penalty = -10
```

---

# 6. 柔软 / 耐压 / 普通测试

### TEST-STK-015

柔软货：

```text
weightAbove < 8
```

→ 0罚分。

### TEST-STK-016

柔软货：

```text
weightAbove >= 8
```

→ `-5`

---

### TEST-STK-017

耐压货上方有重货：

> 不触发“怕压”罚分。

但如果耐压货自身是重货，仍根据所在层触发 Heavy Layer Penalty。

---

### TEST-STK-018

普通货：

> 不触发特殊 Stacking penalty。

---

# 7. 单件罚分封顶

### TEST-STK-019

构造一件：

> 重 + 易损 + 怕压

并让多个规则同时触发，原始扣分 >40。

预期：

```text
cargoPenalty = -40
```

而不是继续叠加。

---

# 8. StackingScore 下限

### TEST-STK-020

所有货物累计罚分 >100：

预期：

```text
StackingScore = 0
```

不得出现负值。

---

# 9. Physical Balance Ratio

### TEST-BAL-001

```text
left = 10
right = 10
```

预期：

```text
physicalBalanceRatio = 1.0
```

---

### TEST-BAL-002

```text
left = 10
right = 9
```

预期：

```text
0.9
```

---

### TEST-BAL-003

```text
left = 10
right = 8
```

预期：

```text
0.8
```

---

### TEST-BAL-004

```text
left = 12
right = 8
```

预期：

```text
0.666666...
```

---

# 10. Player BalanceScore

这组非常关键，因为它验证我们之前修正过的“相对于本题最佳高质量可行解”。

### TEST-BAL-005｜玩家做到本题最优

本题：

```text
referenceBestPhysicalRatio = 0.90
```

玩家：

```text
playerPhysicalRatio = 0.90
```

预期：

```text
BalanceScore = 100
```

---

### TEST-BAL-006｜玩家比本题最优差

Reference：

```text
0.90
```

Player：

```text
8 / 11 = 0.72727
```

预期约：

```text
BalanceScore ≈ 80.8
```

---

### TEST-BAL-007｜BalanceScore 封顶

如果由于等价/reference计算问题：

```text
playerPhysicalRatio > referenceBestPhysicalRatio
```

则：

```text
BalanceScore = 100
```

不得超过100。

此case保留Debug警告供参考解复核，但不等于玩家布局非法：reference限于高质量集合，玩家可能以更差堆叠换取更高实际ratio。不得因此改用纯数学配平reference或删除100封顶。

---

# 11. LayoutScore

### TEST-SCORE-001

```text
Balance = 100
Stacking = 100
```

预期：

```text
Layout = 100
```

---

### TEST-SCORE-002

```text
Balance = 50
Stacking = 82
```

预期：

```text
Layout = 66
```

---

### TEST-SCORE-003

```text
Balance = 100
Stacking = 67
```

预期：

```text
Layout = 83.5
```

---

# 12. PASS 判定

### TEST-PASS-001｜标准 PASS

```text
Layout = 66
Balance = 50
Stacking = 82
```

预期：

```text
PASS
```

---

### TEST-PASS-002｜平均分够，但 Balance 不够

```text
Layout >=55
Balance = 39
Stacking very high
```

预期：

```text
NOT PASS
```

---

### TEST-PASS-003｜平均分够，但 Stacking 不够

```text
Layout >=55
Balance very high
Stacking = 39
```

预期：

```text
NOT PASS
```

---

### TEST-PASS-004｜刚好边界

```text
Layout = 55
Balance = 40
Stacking = 70
```

预期：

```text
PASS
```

---

# 13. Performance Tier

### TEST-TIER-001

```text
PASS
Layout = 60
```

→ `MODEST`

---

### TEST-TIER-002

```text
PASS
Layout = 70
```

→ `NORMAL`

---

### TEST-TIER-003

```text
PASS
Layout = 84.9
```

→ `NORMAL`

---

### TEST-TIER-004｜标准 RICH

```text
Layout = 90
Balance = 85
Stacking = 95
```

→ `RICH`

---

### TEST-TIER-005｜我们刚发现的空档修复

```text
Layout = 85
Balance = 100
Stacking = 70
```

满足 PASS，但没满足双80。

预期：

```text
NORMAL
```

**不得出现 undefined performanceTier。**

---

### TEST-TIER-006

```text
Layout = 89.5
Balance = 79
Stacking = 100
```

→ `NORMAL`

---

### TEST-TIER-007

```text
Layout = 89.5
Balance = 100
Stacking = 79
```

→ `NORMAL`

这三条能把 RICH 的“双80保险”完全固定下来。

---

# 14. 题面 First-layer QA

## TEST-GEN-001｜标准好题

必须存在同一个布局：

```text
physicalBalanceRatio >= 0.85
Stacking >=80
referenceLayout >=85
```

预期：

```text
ACCEPT
```

---

## TEST-GEN-002｜Physical Balance 不足

最佳高质量解：

```text
12 / 8
physicalBalanceRatio = 0.667
Stacking = 95
```

预期：

```text
REJECT_PHYSICAL_BALANCE
```

这就是我们压力测试里最重要的 case。

---

## TEST-GEN-003｜Stacking 不足

最佳高质量 candidate：

```text
physicalBalanceRatio = 1.0
Stacking = 70
```

预期：

```text
REJECT_STACKING_QUALITY
```

---

## TEST-GEN-004｜综合质量不足

```text
physicalBalanceRatio >=0.80
Stacking >=80
referenceLayout <85
```

预期：

```text
REJECT_LAYOUT_QUALITY
```

---

# 15. “同一个解”规则

### TEST-GEN-005

题面有：

方案 A：

```text
Balance excellent
Stacking poor
```

方案 B：

```text
Balance poor
Stacking excellent
```

但不存在一个方案同时满足：

```text
physicalBalance >=0.80
Stacking >=80
Layout >=85
```

预期：

```text
REJECT
```

**禁止分别取 A/B 的最高值拼成合格题。**

这是 Generator 最关键的 regression test 之一。

---

# 16. Hard Floor / Preferred

### TEST-GEN-006

Reference：

```text
physicalBalance = 0.79
```

→ `REJECT_PHYSICAL_BALANCE`

### TEST-GEN-007

Reference：

```text
physicalBalance = 0.80
```

→ 允许继续 QA。

### TEST-GEN-008

Reference：

```text
physicalBalance = 0.83
```

→ 可接受，但：

```text
isBoundaryBalanceQuestion = true
```

或 Debug 中标记 boundary。

### TEST-GEN-009

Reference：

```text
physicalBalance >=0.85
```

→ Preferred。

---

# 17. ConstraintWeight

必须验证每种货物 CW 数据。

例如：

```text
胡椒 = 0
绢帛 = 0.5
河西毛织 = 1
纸张 = 2
漆器 = 2.5
陶瓷 = 3
```

并测试整题：

### TEST-CW-001

```text
陶瓷 + 银器 + 胡椒 + 绢帛
```

CW：

```text
3 + 1 + 0 + 0.5 = 4.5
```

---

# 18. Batch 难度 QA

### TEST-DIFF-001｜Batch1 合法

4件：

```text
CW = 4.5
高约束 <=2
灵活货 >=1
```

→ 可接受 B1。

---

### TEST-DIFF-002｜Batch1 过难

例如：

```text
陶瓷 + 漆器 + 纸张 + 药材
CW = 9.5
```

预期：

```text
REJECT_CONSTRAINT_WEIGHT
```

不得作为 Batch1。

---

### TEST-DIFF-003｜Batch3 太简单

满足：

```text
CW <6
nearOptimalRatio >30%
weightPartitionAmbiguity = LOW
```

预期：

```text
REJECT_TOO_EASY
```

---

### TEST-DIFF-004｜Batch3 太窄

```text
nearOptimalRatio <3%
distinctNearOptimalSolutions <2
```

预期：

```text
REJECT_TOO_NARROW
```

---

# 19. Near-optimal

### TEST-NEAR-001

如果：

```text
bestFeasibleLayout = 94
```

那么：

```text
nearOptimalThreshold = 84
```

所有：

```text
Layout >=84
```

都计入 nearOptimal。

---

### TEST-NEAR-002｜镜像问题

两个 layout 仅左右完全镜像：

> rawSolutionCount 可为2  
> distinctStrategySolutionCount 不应简单算2

如果第一版还没完整实现策略去重：

> 自动测试至少要求 Debug 明确标记此处为 simplified / TODO，不得静默把 raw count 当 distinct count。

---

# 20. 同局重复测试

### TEST-SEQ-001

如果 Batch1 和 Batch2：
- 高度重复同一 cargo set
- 同一 weight pattern
- 同一核心 decision pattern

生成器应：

```text
REJECT_DUPLICATE_PATTERN
```

或显著降权后重抽。

---

# 21. 提交逻辑

### TEST-SUBMIT-001

货物未全部装入：

```text
确认装好 hidden
```

按钮不显示；绕过 UI 的未装完提交也必须被拒绝。

---

### TEST-SUBMIT-002

所有货已装入，但玩家没有点：

> `确认装好`

不得自动完成。

---

### TEST-SUBMIT-003

NOT PASS 后：

- 当前布局解锁
- 仍可取出
- 仍可重新放入
- 仍可再次提交

---

# 22. Normal Timeout

### TEST-TIME-001

```text
Batch1 PASS
Batch2 PASS
Batch3 unfinished
timer = 0
```

预期：

- Batch1 reward 保留
- Batch2 reward 保留
- Batch3 reward = 0
- 进入正常 Settlement
- 不标记 ABORTED
- 不显示 FAILED

---

### TEST-TIME-002

```text
Batch1 not completed
timer = 0
```

预期：

```text
cash = 0
```

但：

> 不显示 FAIL。

---

# 23. ABORTED

### TEST-ABORT-001

FORMAL 中：
- Batch1已经完成
- 玩家 Global Close
- 确认退出

预期：

```text
completionStatus = ABORTED
cashDelta = 0
timeCostTicks = 0
formalWorkHistory = false
```

前面 Batch1 收益全部不落状态。

---

### TEST-ABORT-002

玩家点击关闭后取消退出：

> 回到当前小游戏状态，已有进度保留。

---

# 24. TRIAL

### TEST-TRIAL-001

TRIAL 三批全部完成：

预期可以产生：

```text
simulatedPayout
performanceTier
batchResults
```

但：

```text
cashDelta = 0
timeCostTicks = 0
tripStateDelta = 0
formalWorkHistory = false
```

---

# 25. FORMAL 世界时间

### TEST-WORLD-001

FORMAL 从晨开始，正常结算：

```text
advanceTime(2)
```

结果：

> 晨 → 暮

---

### TEST-WORLD-002

不得调用：

```text
advanceDay()
```

---

### TEST-WORLD-003

昼：

```text
FULL_DAY start = disabled
```

显示：

> 今日时间不足

---

# 26. Economy 测试

现在我们刚刚补全了 qualityReward。

## Batch1

```text
MODEST = +0
NORMAL = +0
RICH = +1
```

## Batch2

```text
MODEST = +0
NORMAL = +1
RICH = +2
```

## Batch3

```text
MODEST = +0
NORMAL = +2
RICH = +3
```

---

### TEST-ECO-001｜三批 MODEST

```text
9 + 2 + 2 + 3 = 16
```

预期：

> 16钱

---

### TEST-ECO-002｜三批 NORMAL

```text
9
+2
+(2+1)
+(3+2)
=19
```

预期：

> 19钱

---

### TEST-ECO-003｜三批 RICH

```text
9
+(2+1)
+(2+2)
+(3+3)
=22
```

预期：

> 22钱

---

### TEST-ECO-004｜Cash Cap

任何内部计算即使异常超过：

```text
22
```

最终：

```text
cash <=22
```

---

### TEST-ECO-005｜只完成 Batch1 MODEST

```text
9 + 2 = 11
```

预期：

> 11钱

---

### TEST-ECO-006｜零批完成

```text
0钱
```

不是9钱。

这个很重要：

> **基础9钱不是“只要进场就有”。**

必须至少完成第一批，才进入有薪结算。

---

# 27. Trip / Reputation

### TEST-INTEGRATION-001

Active trip：

正式收入写入：

```text
tripSummary.livelihoodIncome
```

不得写入：

```text
tradeProfit
```

---

### TEST-INTEGRATION-002

普通完成：

```text
reputationDelta = 0
```

不得修改 `reputationTurnover`。

---

# 28. P0 必须通过的关键阻断测试

我建议不是所有测试都同等级。

以下如果任何一个失败：

> **P0 = NOT ACCEPTED**

阻断项：

```text
TEST-STK-019   单件 penalty cap
TEST-BAL-005   本题最优 = Balance 100
TEST-PASS-002  子项门槛
TEST-TIER-005  Layout>=85但未双80 → NORMAL
TEST-GEN-002   12/8坏题必须被拒
TEST-GEN-005   同一reference solution原则
TEST-DIFF-003  Batch3过易拒绝
TEST-DIFF-004  极窄解拒绝
TEST-SUBMIT-002 不自动提交
TEST-TIME-001  正常超时保留已完成批
TEST-ABORT-001 ABORTED清零
TEST-TRIAL-001 TRIAL不落真实状态
TEST-ECO-003   满额22
TEST-ECO-006   零批=0钱
TEST-WORLD-001 FULL_DAY=2 ticks
```

这些属于：

> **Regression-Critical Tests**

以后每次 v0.4 / v0.5 调参数都应该重新跑。

---

# 29. 我建议再加一个 Generator Stress Test

不是单个 case，而是批量生成。

例如 P0 完成时自动：

```text
Generate:
500 Batch1
500 Batch2
500 Batch3
```

检查：

- 0 个题违反 Hard Floor
- 0 个题没有 qualifiedReferenceSolution
- 0 个题违反本 Batch CW hard constraints
- 0 个题出现 undefined performance/reference
- generationAttempts 不出现异常无限循环
- 各 RejectReason 有统计
- boundary 0.80–0.85 题数量可见
- Near-optimal 分布可导出

我建议目标先定：

> **连续生成1500个 accepted boards，不出现一个违反第一层 QA 的题。**

这个比手测10题有价值得多。

---

# 30. P0 输出报告

Codex 完成逻辑原型时，最好自动生成一个类似：

```text
P0_TEST_REPORT

Unit tests:
passed: <实际通过数>
total: <实际执行数>

Generator stress:
Batch1 accepted: <实际数；验收目标500>
Batch2 accepted: <实际数；验收目标500>
Batch3 accepted: <实际数；验收目标500>

Invalid accepted boards:
<实际数；验收要求0>

Reject reasons:
PHYSICAL_BALANCE: xxx
STACKING_QUALITY: xxx
LAYOUT_QUALITY: xxx
CONSTRAINT_WEIGHT: xxx
TOO_EASY: xxx
TOO_NARROW: xxx
DUPLICATE_PATTERN: xxx

Average generation attempts:
B1: x.x
B2: x.x
B3: x.x
```

这份东西以后会非常有用。

如果发现：

> Batch3平均要抽50次才能生成一道题

那就说明我们的生成参数太苛刻，即使最终题面合法，算法配置也需要调整。


## 31. 来源修正与测试分层（不改规则）

- TEST-PASS-004 原稿的 Balance=40、Stacking=40、Layout=55 不符合 50/50 公式。本文使用 40/70→55；另测镜像 70/40→55。40/40→40 必须 NOT PASS。
- TEST-TIER-006/007 的 79/100 与 100/79 综合分均为 89.5；原稿写90是算术笔误，预期 NORMAL 不变。
- TEST-STK-019 的“重+易损+怕压”不在冻结15种货物中：作为 synthetic unit fixture 验证单件封顶，不加入 CARGO_DATA 或生成器货池。实际货物路径另外验证各项罚分。
- TEST-GEN-004 是 QA 分支单元测试：可注入不合格指标验证拒绝分支，不能声称是已构造的真实 reference。参考布局自身归一化 Balance=100 且 Stacking>=80 时，Layout>=90；不得伪造低于85的完整参考解作为端到端证据。
- TEST-DIFF-001 等仅测试所述难度检查；“可接受”不意味着跳过 First-layer QA、同局去重等其余检查。TEST-GEN-001 也仅代表第一层条件通过。
- 原稿报告里的测试数与平均尝试次数是格式示例，不是已执行结果；本包没有原型代码，不声称 P0/P1 运行通过。

## 32. P1 已确认更新对应的追加测试

以下是既有 UI/状态规则的可验证表述，不引入新玩法参数。

| ID | 操作/条件 | 预期 |
|---|---|---|
| TEST-UI-001 | 城市点击营生、选驼队装货 | 城市→营生列表→READY，同一窗口切换内容 |
| TEST-UI-002 | READY 打开玩法说明后点击知道了 | READY→HOW_TO_PLAY→READY；不开始计时 |
| TEST-UI-003 | 点击开始装货或试玩 | 进入对应 FORMAL/TRIAL Gameplay，才开始本局倒计时 |
| TEST-UI-004 | 每批初始4/5/6/7/8件，操作第3件；存在第6件时也放入第6件再取出 | 固定4列最多2行；余货不重排；取出回原位；空白无占位框 |
| TEST-UI-005 | 所有货装入，再取出任一件 | 确认装好在待装区中央出现后消失；区域高度不变；不自动提交 |
| TEST-UI-006 | 选等待货/顶层/下层/满袋 | 放入↓ / 取出↑ / 先取出上层货物 / 已满，空间位置区分两袋 |
| TEST-UI-007 | 实际 physical ratio = .79/.80/.849/.85 | 红/黄/黄/绿；无分数和左右重文字；非 BalanceScore 映射 |
| TEST-UI-008 | 放入或取出货物 | 更新实际平衡条；选中不预览未来布局 |
| TEST-UI-009 | 手机宽360/390/430，基准390×844 | 不滚动、不整体scale、按钮不裁切，两袋和层序可辨 |
| TEST-UI-010 | Debug OFF/ON | OFF隐藏分数/实际重量/reference；ON可读取诊断且不遮核心操作 |
| TEST-FLOW-001 | 有效提交后快速重复点击 | 本次布局锁定，单次判定与单次批次完成；不能重复领奖 |
| TEST-FLOW-002 | PASS 且批次<3 | 起身稳定→档位短反馈→淡出切换→下一匹卧姿；无下一批按钮 |
| TEST-FLOW-003 | NOT PASS 且仍有时间 | 起身不稳→卧姿→还不够稳，再调一调→原布局可调整 |
| TEST-FLOW-004 | evaluation/试载/切批阶段 | 倒计时暂停；可操作 Gameplay 才继续 |
| TEST-FLOW-005 | 有效提交已进入锁定，再收到归零事件 | 完成本次判定；PASS计入有效批，NOT PASS不计；不吞提交 |
| TEST-FLOW-006 | 归零先发生、未有效提交 | 锁操作，当前批未完成，已PASS保留；不自动试载 |
| TEST-FLOW-007 | 第3批提前PASS，分别余1秒/20秒 | 直接结算；相同批次表现所得相同，无速度奖 |
| TEST-FLOW-008 | Gameplay ×→继续装货 | 关闭确认层，布局/进度/剩余时间恢复；不产生结算 |
| TEST-FLOW-009 | Gameplay ×→结束装货（此前PASS 0/1/2批） | ABORTED，0 cash / 0 tick / no formal record；前批收益不落状态 |
| TEST-FLOW-010 | Settlement 0批/有完成批/TRIAL | 结束/完成标题；今日所得0钱/工资结构/模拟所得；无Global Close |
| TEST-FLOW-011 | Settlement 点击两出口、重复触发 | 返回营生→城市营生列表；退出营生→城市主界面；导航不再次结算 |
| TEST-ECO-007 | 前两批均MODEST/NORMAL/RICH | 分别13/14/16钱；未PASS的B3无奖励 |
| TEST-WORLD-004 | FORMAL正常超时且0批 | cash=0；正常FULL_DAY contract仍为2 ticks，非ABORTED |
| TEST-TRIAL-002 | TRIAL timeout/完成/中止 | 真实cash/time/trip/history保持原值；模拟记录与正式记录隔离 |

TEST-FLOW-001/011 中“单次”是既定收益与正常结算契约的幂等性验证，不规定新的存储接口。

## 33. 冻结参数与新增覆盖验收

Hard Floor 0.80 = FROZEN_FOR_PROTOTYPE。Preferred Target 0.85 = PLAYTEST_TUNABLE，首版保持0.85。Batch3=8 = FROZEN_FOR_PROTOTYPE。配置化不等于可擅改。
qualityReward 初版必须使用 QUALITY_REWARD_MAPPING_v0.3.md；FULL_DAY=advanceTime(2)，1 world day=3 ticks，禁止 advanceDay。
本计划所有用例应产出实际 PASS/FAIL/NOT_RUN 及证据；第28节保留原 regression-critical 集合。新增 P1 用例对应验收表，不得以文档核验代替运行。


## 34. 基线合并补充覆盖
TEST_CASES.md保留MERGE系列实际15货物布局、全部罚分边界、near-optimal分母与40种顺序奖励组合。枚举优化需独立穷举oracle对照；属性软约束不可剔除；所有布局同题同reference。0/0仅UI空态安全，不新增正式分数。
未定义生成细节明确记录前不声称完整压力验收；真实1500 accepted须500每批，不能以QA注入替代。文档核验脚本不是游戏实现单测。
