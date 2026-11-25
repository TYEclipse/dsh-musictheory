# CHANGELOG · dsh-musictheory

> 版本口径：patch 修 bug/补测试｜minor 新增用户可见功能｜major 破坏性变更。安装：`dsh plugin --profile web add github:TYEclipse/dsh-musictheory`

## [0.6.0] — 2026-11-26
### Minor · R111
- [自主进化] R111 新增 `progression_build`：罗马数字 → 拼写正确的和弦（`roman_numeral` 的逆运算）。C 大调 `vi IV I6 V` → `Am F C/E G`；裸数字的大小写定性质（`I` 大三 / `i` 小三），变音按本调音阶读（C 大调 `bVII` = `Bb`），数字低音按转位读（`I6`=`C/E`、`V65`=`G7/B`、`V43`=`G7/D`、`V42`=`G7/F`），每和弦给出根音/性质/和弦音/inKey/diatonic/keyTriad；副属和弦（`V/V`）与不成形的数字一律拒绝而不猜；`qualities` 可按数字点名性质，处理 `I6`（第一转位）与加六度和弦写法相撞的情形。每个生成的和弦都会重新分析，`roman`/`inKey`/`diatonic` 与 `roman_numeral` 永不漂移。测试 169 条（+14）、覆盖率 92.71%。
- [自主进化] R111 progression_build: numerals back into spelled chords (the inverse of `roman_numeral`). In C major `vi IV I6 V` → `Am F C/E G`; case decides the quality of a bare numeral, accidentals are read against the key's own scale (`bVII` in C is `Bb`), figures are inversions (`I6`=`C/E`, `V65`=`G7/B`, `V43`=`G7/D`, `V42`=`G7/F`); every chord reports root, quality, tones, inKey, diatonic and the key triad, and is re-analyzed so those facts cannot drift from `roman_numeral`. Secondary dominants (`V/V`) and malformed figures are refused rather than guessed; `qualities` names a quality per numeral for the `I6` / added-sixth collision. 169 tests (+14), coverage 92.71%.

## [0.5.0] — 2026-11-06
### Minor · R91
- [自主进化] R91 新增 key_signature（五度圈调号：升降号书写序 / 关系调 / 同主音调 / 同音异名 / 理论调标记）与 roman_numeral（进行分析：级数按音名字母定、拼写和弦音、inKey/diatonic、数字低音 C/E=I6 与 G7/F=V42）

## [0.4.0] — 2026-10-18
### Minor · R72
- [自主进化] R72 新增 scale_identify（由音反推音阶，拼写一致者优先）+ oracle 迁移

## [0.3.0] — 2026-09-29
### Minor · R53
- [自主进化] R53 新增 transpose（拼写感知移调）与 chord_identify（和弦识别/转位/省略音）

## [0.2.3] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

## [0.2.2] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

## [0.2.1] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

