# Test Cases — 合并新增回归向量
与AUTOMATED_TEST_PLAN.md互补，不覆盖补充包106条测试定义；本文件是待执行用例，不是原型通过证据。
|ID|输入/操作|预期|
|---|---|---|
|MERGE-STK-001|左底→顶[于阗玉,纸张]，右[陶瓷,绢帛]|左右6/6，Stack100；reference=1时Balance100/Layout100/RICH|
|MERGE-STK-002|同题左[纸张,于阗玉]，右[绢帛,陶瓷]|纸张罚18、两重货各5，总28，Stack72，Balance100，Layout86→NORMAL|
|MERGE-STK-003|漆器底，上于阗玉和银器|漆器怕压38+易损10，单件封顶40，冻结实际货物路径|
|MERGE-STK-004|柔软上方总重7/8|分项罚0/5，无加分|
|MERGE-STK-005|易损上方1或2件HEAVY|易损额外均10，不重复加20|
|MERGE-PASS-001|40/40、40/70、70/40|Layout40 NOT PASS、55 MODEST、55 MODEST|
|MERGE-TIER-001|79/100或100/79|Layout89.5、NORMAL，不是90|
|MERGE-GEN-001|同题所有feasible，含低分布局|nearRatio分母不只PASS，分子含等于best-10|
|MERGE-GEN-002|.03 nearRatio且distinct1|不触发<.03 AND <2，但不能据此跳过distinct要求自动接受|
|MERGE-GEN-003|feasible属性违反|仍参与枚举及罚分，不能直接当非法|
|MERGE-UI-001|少于6件批次|只操作实际存在的第3件；第6件交互仅在有第6件时执行|
|MERGE-ECO-001|0–3批顺序有效完成的所有档位组合|40种组合，0批0，3批16–22，无越界|
原TEST-STK-019 synthetic fixture仅单元隔离；原TEST-GEN-004不可达参考指标仅QA branch injection，不作为真实生成题。
保留所有压力/交互/时间/集成检查见AUTOMATED_TEST_PLAN和PROTOTYPE_ACCEPTANCE_CRITERIA。不能把文档算术检查称为游戏evaluateLayout测试。
