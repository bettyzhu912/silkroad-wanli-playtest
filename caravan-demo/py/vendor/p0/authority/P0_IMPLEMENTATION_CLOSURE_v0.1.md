# P0_IMPLEMENTATION_CLOSURE_v0.1

**Project:** 《驼队装货》  
**Scope:** P0 Logic Prototype Implementation Closure  
**Status:** IMPLEMENTATION_CLOSURE / NO GAMEPLAY REDESIGN  
**Purpose:** Close implementation-blocking ambiguities without changing frozen v0.3 gameplay, interaction, cargo pool, economy contract, or approved scoring values.

---

## 1. Reference Selection

A generated board may have multiple valid high-quality layouts. The generator must first enumerate all feasible layouts and build:

```text
qualifiedReferenceSet
```

A layout enters `qualifiedReferenceSet` only if the same single layout simultaneously satisfies:

```text
physicalBalanceRatio >= 0.80
StackingScore >= 80
referenceLayoutScore >= 85
```

The unique `referenceSolution` is selected deterministically from `qualifiedReferenceSet` using this fixed ordering:

1. Higher `LayoutScore`
2. If tied, higher `physicalBalanceRatio`
3. If still tied, higher `StackingScore`
4. If still tied, canonical layout signature ascending lexicographically

The generator must save:

```text
referenceSolution
referencePhysicalBalanceRatio
referenceStackingScore
referenceLayoutScore
```

`BalanceScore` for the player must use the selected reference solution's `referencePhysicalBalanceRatio`.

**Forbidden:** taking Balance from one layout and Stacking from another layout to construct a synthetic reference.

---

## 2. Best Feasible vs Reference

P0 uses two separate concepts:

### `bestFeasibleLayout`

The layout with the highest `LayoutScore` among all feasible layouts.

### `referenceSolution`

The deterministic layout selected from `qualifiedReferenceSet` using the ordering defined above.

If `bestFeasibleLayout` satisfies all reference qualification conditions, it should naturally rank first and become the reference.

If no layout satisfies the reference qualification conditions:

```text
REJECT_REFERENCE_NOT_FOUND
```

---

## 3. Second-Layer QA — Hard Reject vs Soft Target

Earlier design language such as `target`, `recommended`, and `mostly` must **not** automatically become hard rejection conditions.

### 3.1 Hard Reject

The following conditions are hard rejection rules.

#### All batches

Reject if:

- first-layer QA fails;
- there is no qualified reference solution;
- basic feasibility fails;
- `constraintWeight` exceeds an explicitly frozen maximum for that batch;
- generation cannot complete within the defined attempt cap.

#### Batch 2 / Batch 3 — Too Narrow

```text
nearOptimalRatio < 0.03
AND distinctNearOptimalSolutions < 2
→ REJECT_TOO_NARROW
```

Do **not** convert this `AND` condition into `OR`.

#### Batch 3 — Too Easy

```text
constraintWeight < 6
AND nearOptimalRatio > 0.30
AND weightPartitionAmbiguity == LOW
→ REJECT_TOO_EASY
```

#### Batch 3 — High-constraint density

```text
count(CW == 3) > 2
→ REJECT
```

#### Batch 1

Reject if:

```text
count(CW >= 2) > 2
```

Also reject if all cargo are high-constraint items.

---

## 4. Soft Target / Telemetry

These ranges are preferred targets, not automatic rejection rules.

### Batch 1

```text
target ConstraintWeight: 2–5
nearOptimalRatio target: 20–60%
weight complexity: LOW / MEDIUM preferred
```

### Batch 2

```text
target ConstraintWeight: 5–10
CW >= 2: usually 2–3 cargo
nearOptimalRatio target: 8–30%
complexity: mostly MEDIUM
distinctNearOptimalSolutions >= 2 preferred
```

### Batch 3

```text
target ConstraintWeight: 8–13
CW >= 2: recommended 2–4 cargo
at least 2 cargo with CW <= 1 preferred
nearOptimalRatio target: 3–18%
complexity: MEDIUM / HIGH preferred
distinctNearOptimalSolutions >= 2 preferred
```

If a board falls outside a soft target but does not trigger a hard reject:

```text
ACCEPT_WITH_WARNING
```

The condition should be logged as telemetry rather than silently converted into a rejection rule.

---

## 5. Generator Attempt Policy

To prevent infinite generation loops, each board-generation request has a fixed P0 attempt cap:

```text
maxGenerationAttempts = 200
```

Required process:

```text
for attempt in 1..200:
    sample candidate
    run feasibility
    run first-layer QA
    run second-layer QA

    if accepted:
        return board
```

If no board is accepted after 200 attempts:

```text
GENERATION_EXHAUSTED
```

The report must record at minimum:

```text
batch
seed
attemptCount
rejectReasonDistribution
```

`GENERATION_EXHAUSTED` must never silently relax frozen constraints.

---

## 6. Generator Fallback

P0 has **no automatic fallback**.

If generation reaches the attempt cap, it is forbidden to:

- lower Hard Floor `0.80`;
- lower frozen reference requirements;
- reduce Batch 3 from 8 cargo;
- ignore Stacking QA;
- accept an otherwise rejected boundary-invalid board;
- substitute a hidden handwritten board;
- change the cargo pool;
- silently change scoring thresholds.

The only permitted result is:

```text
GENERATION_EXHAUSTED
```

with diagnostics.

---

## 7. Same-Game Dedup Window

Same-game dedup only considers batches already accepted in the **current run**.

```text
recentAcceptedBatches
```

Maximum history:

```text
Generate B1 → no history
Generate B2 → compare with B1
Generate B3 → compare with B1 + B2
```

No cross-run or long-term player-history dedup is required in P0.

---

## 8. Dedup — Hard Reject vs Warning

P0 does not introduce probabilistic downweight tuning.

### Hard reject

If a new board has the exact same normalized:

```text
decisionPatternSignature
```

as a prior accepted batch in the same run:

```text
REJECT_DUPLICATE_DECISION_PATTERN
```

### Warning only

The following similarities do not automatically reject a board:

- high cargo ID overlap;
- similar archetype distribution;
- similar weight multiset.

Log:

```text
WARN_REPEAT_CARGO
WARN_REPEAT_ARCHETYPE
WARN_REPEAT_WEIGHT_PATTERN
```

P0 uses hard reject or telemetry only; no new sampling-weight parameters are introduced.

---

## 9. Decision Pattern Signature

The P0 normalized decision pattern must not depend on art assets or display names.

It should include:

```text
batch size
weight multiset
archetype multiset
high-constraint cargo count
heavy-durable count
heavy-fragile count
pressure-sensitive count
soft count
reference left/right total-weight pair
reference relative archetype layer categories
```

For relative layer categories:

```text
LOW  = layer 1–2
HIGH = layer 3–4
```

Left/right mirror variants must normalize to the same strategy signature.

For example:

```text
10 / 9
9 / 10
```

represent the same normalized balance pattern.

---

## 10. Mirror Normalization

All layouts used for strategy dedup or distinct-solution counting must treat pure left/right mirrors as the same strategy.

For a layout:

1. generate the `(left, right)` signature;
2. generate the mirrored `(right, left)` signature;
3. compare both;
4. choose the lexicographically smaller representation as the canonical signature.

Do not count mirror-only variants as separate strategy solutions.

---

## 11. distinctNearOptimalSolutions

Near-optimal remains defined as:

```text
LayoutScore >= bestFeasibleLayoutScore - 10
```

To calculate `distinctNearOptimalSolutions`:

1. enumerate all near-optimal feasible layouts;
2. convert each to the canonical strategy signature;
3. deduplicate signatures;
4. count the remaining unique signatures.

```text
distinctNearOptimalSolutions =
count(unique canonical strategy signatures)
```

Raw layout count must not be used as a substitute.

---

## 12. WeightPartitionAmbiguity

This is a generator-only diagnostic used to make the existing Batch 3 `REJECT_TOO_EASY` rule executable.

First enumerate all legal left/right cargo partitions while ignoring vertical stack order.

For each partition:

```text
physicalBalanceRatio =
min(leftWeight, rightWeight) /
max(leftWeight, rightWeight)
```

Define:

```text
bestPhysicalRatio =
maximum physicalBalanceRatio among all legal partitions
```

Count distinct canonical left/right cargo partitions satisfying:

```text
physicalBalanceRatio >= bestPhysicalRatio - 0.05
```

Call this:

```text
nearBestWeightPartitions
```

Then classify:

```text
LOW:
nearBestWeightPartitions <= 1

MEDIUM:
nearBestWeightPartitions == 2

HIGH:
nearBestWeightPartitions >= 3
```

Left/right mirrors count as one partition.

This value is not shown to the player.

---

## 13. Reference Stability and Player BalanceScore

Once the reference solution is selected for a generated board, it remains fixed for that board.

Player calculation remains:

```text
playerPhysicalRatio =
min(playerLeftWeight, playerRightWeight) /
max(playerLeftWeight, playerRightWeight)

BalanceScore =
min(
  100,
  100 * playerPhysicalRatio / referenceBestPhysicalRatio
)
```

If the player unexpectedly achieves:

```text
playerPhysicalRatio > referenceBestPhysicalRatio
```

then:

```text
BalanceScore = 100
```

and debug output must record:

```text
WARN_PLAYER_EXCEEDS_REFERENCE_PHYSICAL_RATIO
```

Do not dynamically replace the reference during player execution.

---

## 14. B2 Size Coverage in Stress Testing

The formal runtime probability distribution for Batch 2 sizes `5 / 6 / 7` remains undefined.

P0 must **not** invent a production probability.

For the required 500 accepted Batch 2 stress-test boards, use deterministic coverage:

```text
size 5: 167 accepted boards
size 6: 166 accepted boards
size 7: 167 accepted boards
```

This is a **test sampling distribution only**.

It must not be written into runtime configuration as the production generation probability.

---

## 15. Non-Blocking Deferred Runtime Policy

The following remain intentionally undefined and must not block P0 logic implementation or stress testing:

- formal runtime probability for Batch 2 size `5 / 6 / 7`;
- cross-run long-term dedup;
- exact visual initial state of the balance indicator when both bags are empty (`0 / 0`);
- whether TRIAL is independently enterable during Day / Evening from the outer system;
- production generator sampling weights beyond P0 correctness requirements;
- exact production boundary-question proportion;
- whole-session `performanceTier` aggregation beyond per-batch tier preservation;
- production telemetry clock convention where synthetic or monotonic test timing is sufficient.

These must remain explicitly deferred rather than being silently invented.

---

## 16. Additional P0 Non-Blocking Clarifications

Where the handoff has not frozen a formal runtime policy, the P0 test harness may use explicit inputs to test logic without creating production rules.

Examples:

```text
timerConfig = explicitly supplied as 75 or 90
B2 batch size = explicitly supplied as 5, 6, or 7
```

Per-batch `performanceTier` must be complete.

If whole-session `performanceTier` is still undefined, P0 may represent it as:

```text
null
```

or:

```text
NOT_AGGREGATED
```

provided this is documented and not mistaken for a frozen production rule.

Do not introduce a generic ordinary:

```text
FAILED
```

state.

---

## 17. Relationship to Frozen v0.3 Rules

This implementation closure does **not** change any of the following:

- Hard Floor `0.80 = FROZEN_FOR_PROTOTYPE`
- Preferred Target `0.85 = PLAYTEST_TUNABLE`, initial value remains `0.85`
- Batch 3 = `8`, frozen for v0.3 prototype
- weight values `LIGHT=1 / MEDIUM=3 / HEAVY=5`
- existing StackingScore penalties
- `LayoutScore = 0.5 * BalanceScore + 0.5 * StackingScore`
- existing PASS thresholds
- performance tier rule:
  - PASS + `LayoutScore >= 85` but either `BalanceScore < 80` or `StackingScore < 80` → `NORMAL`
- approved qualityReward mapping
- `FULL_DAY = advanceTime(2)`
- one world day = 3 ticks
- no `advanceDay()`
- TRIAL state isolation
- ABORTED state isolation
- 0 completed batches = 0 cash
- frozen 15-item cargo pool
- Tap-first interaction
- two panniers
- four logical layers per pannier
- current three-batch structure `4 / 5–7 / 8`

Any change to these requires a separately approved design change or balance patch according to the existing handoff rules.

---

# Continue-Execution Instruction for the Current P0 Work

The earlier `P0_PREFLIGHT_EVIDENCE` correctly recorded implementation blockers before this closure existed.

This document closes the implementation-blocking parts concerning:

- reference selection;
- second-layer QA hard-vs-soft classification;
- generator attempt cap and fallback;
- same-game dedup;
- mirror normalization;
- distinct near-optimal strategy counting;
- `weightPartitionAmbiguity`;
- B2 stress-test size coverage.

The following must be treated as **P0 non-blocking / deferred runtime policy** and must not be used again to stop P0:

- formal runtime B2 `5 / 6 / 7` probability;
- boundary-question production proportion;
- production sampling weights;
- TRIAL Day/Evening outer-entry policy;
- whole-session performance-tier aggregation;
- production telemetry clock convention.

Proceed with P0 implementation using:

```text
final v0.3→P1 handoff
+
P0_IMPLEMENTATION_CLOSURE_v0.1
```

Required next execution:

1. implement unified `evaluateLayout()`;
2. implement scoring, PASS, and per-batch tier logic;
3. implement generator and QA;
4. implement economy/result contracts required by P0;
5. implement TRIAL / ABORTED / Timeout isolation tests;
6. run the approved `AUTOMATED_TEST_PLAN`;
7. run generator stress testing:
   - 500 accepted Batch 1 boards;
   - 500 accepted Batch 2 boards;
   - 500 accepted Batch 3 boards;
8. report:
   - `P0_LOGIC: PASS/FAIL`
   - `P0_AUTOMATED_TESTS: PASS/FAIL`
   - `P0_GENERATOR_STRESS: PASS/FAIL`

If a new blocker remains after applying this closure, it must identify a concrete function, test, or state transition that cannot be implemented from the final handoff plus this closure.

Do not reopen already-deferred runtime-policy questions as implementation blockers.

Do not redesign rules or tune frozen values.
