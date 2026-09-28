# dsh-musictheory 🎼

DeepSeek Harness（`dsh`）的音乐理论数学工具箱——零运行时依赖，纯 12 平均律算术。

## 为什么需要它

大模型心算音乐理论时有规律地出错：

- `C4` 的频率常被算错——精确值是 `440 · 2^((60−69)/12) = 261.625565… Hz`
- `G#` 大三和弦常被写成 `G# C D#`——正确拼写是 **G# B# D#**（G# 上方大三度是 B#，不是 C）
- `F#` 大调音阶常漏掉 **E#**（六个升号，不是五个）
- 同音异名（`Bb` vs `A#`）在五线谱上含义不同
- 和弦转位与歧义读法（`E G C` 是 `Cmaj/E`；`C E G A` 既是 `C6` 又是 `Am7`）
- 移调时按半音硬数，忽略音名字母阶梯（`G#` 上移大三度应为 `B#` 而非 `C`）

本插件用确定性表格 + 拼写引擎全部代劳。

## 工具（9 个）

| 工具 | 功能 |
|------|------|
| `note_info` | 解析音名（`C#4`、`Bb3`、`B#4`、`F##4`、`Gx4`）→ MIDI 号、八度、音级、12-TET 频率、全部常规同音异名拼写 |
| `freq_to_note` | 频率(Hz) → 最近音符、MIDI 号、音分偏差、同音异名 |
| `chord_build` | **26 种**和弦质量（maj/min/dim/aug/sus2/sus4/5/6/m6/7/maj7/m7/m7b5/dim7/aug7/7sus4/add9/madd9/maj9/9/m9/11/m11/13/maj13/6/9）的正确拼写 + 音程标注 + MIDI + 频率 |
| `scale_generate` | **17 种**音阶（大调/自然小调/和声小调/旋律小调/多利亚/弗里几亚/利底亚/混合利底亚/洛克里亚/大小五声/布鲁斯/全音/半音，含 ionian/minor/aeolian 别名）的正确拼写 + 级数 + 音程 + 频率 |
| `interval_build` | 按音程构建正确拼写的目标音（上/下行均可）：`C + M3 = E`、`G# + M3 = B#`（不是 C）、`C 下行 d5 = F#`；34 个规范音程名 + 别名（tritone/octave/semitone/whole_tone） |
| `interval_info` | 命名两音之间的音程：字母距离定度数（`C→F#` 是增四度、`C→Gb` 是减五度），半音数定性质，方向与复音程（`C4→D5` = M9 = M2 + 一个八度）单独报出 |
| `scale_harmonize` | 7 音音阶的和声化：每级三和弦 + 罗马数字 + 正确拼写（C 大调 → `I ii iii IV V vi vii°`，和声小调 III 为增三和弦）；`sevenths: true` 得七和弦（`Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7`） |
| `transpose` | 1—16 个音的拼写感知移调：`Bb3 G3 D4` 上移 M2 → `C4 A3 E4`；`C#4 E#4 G#4` 下移 m3 → `A#3 C##4 E#4`；`F#4` 下移 P4 → `C#4`。用于乐器移调（降 B 小号 +M2、降 E 中音萨克斯 +M6）与转调 |
| `chord_identify` | 由 2—8 个音识别和弦：`C E G` → `Cmaj`；`E G C`（低音 E）→ `Cmaj/E` 第一转位；`C E G A` 同时给出 `C6` 与 `Am7/C`；`C Eb Gb Bbb` 给出四个减七转位；写在 `B#` 上的和弦仍是 `B#`。省略音（`C E Bb D` → `C9`，`exact: false`、`missing: ["5"]`）也能匹配 |

## 安装

```bash
dsh plugin --profile <profile-name> add github:TYEclipse/dsh-musictheory
```

（也可钉版本安装：`add github:TYEclipse/dsh-musictheory#v0.3.0`。）

## 示例

```
note_info  note="C#4"           → MIDI 61, 八度 4, 音级 1, 277.18 Hz, 又名: Db4
freq_to_note  frequencyHz=442   → A4 (MIDI 69), +7.85 音分
chord_build  root="G#" quality="maj"  → G#maj: G#4 B#4 D#5
chord_build  root="C" quality="dim7"  → Cdim7: C4 Eb4 Gb4 Bbb4
scale_generate  root="F#" type="major" → F#4 G#4 A#4 B4 C#5 D#5 E#5
scale_generate  root="C" type="blues"  → C4 Eb4 F4 Gb4 G4 Bb4
interval_build  root="C" interval="M3" → E4 (MIDI 64, 329.63 Hz)
interval_info  note1="C4" note2="F#4"  → A4, 6 个半音, 上行
scale_harmonize  root="C" type="major" → I ii iii IV V vi vii°
transpose  notes=["Bb3","G3","D4"] interval="M2" → C4 A3 E4（降 B 乐器读谱）
chord_identify  notes=["E4","G4","C5"] → Cmaj/E（maj，第 1 转位）
chord_identify  notes=["C4","E4","G4","A4"] → C6，另有读法 Am7/C
chord_identify  notes=["C4","E4","Bb4","D5"] → C9（exact: false，missing ["5"]）
```

### `chord_identify` 的排序规则

每个读法按 `2 × 转位 + 和弦常见度权重 + 3 × 省略音数` 打分（常见度为 0 的是
`maj`/`min`/`dim`/`maj7`/`m7`/`7`，扩展色彩和弦最高 4），再依次按「根音在低音优先、
表格顺序、根音音级、转位」排序。`C6` 与 `Am7/C` 这类并列会按乐手习惯的读法排在前面，
`total` 给出截断（上限 12 条）前的全部读法数。

## 拼写原理

每个和弦/音阶都是「音名字母步进 + 半音偏移」的表格；拼写引擎计算让目标字母
落在目标音级上所需的变音记号——变音记号永远跟着音名走（G# 的三度是 B 音位 → B#；
C 的减七度是 B 音位 → Bbb），这正是手写乐理最容易错的地方。

移调与和弦识别走同一套字母阶梯：`transpose` 先定目标字母再算变音记号；
`chord_identify` 用音级集合匹配（八度、复音、重复音都不影响），根音拼写取输入里
写出的那一个。

## 律制

所有工具支持 `a4Hz` 参数（插件配置 `config.a4Hz`）——巴洛克 415、威尔第 432、
现代乐团 442 Hz 等均可；频率按 `a4 · 2^((midi−69)/12)` 计算。

## 安全与设计

- 零运行时依赖：纯算术，无网络、无 shell、无文件访问
- 确定性输出；非法输入返回结构化错误
- 123 个单元测试；数值锚点由随源码提交的独立 Python oracle（`test/oracle/anchors.py`）
  逐条打印（可用 `python3 test/oracle/anchors.py --check` 复验公开事实）

## 路线图

- 音程转位与更多复音程
- 更多和弦/音阶类型——开 issue 提需求！

## 许可证

MIT © 2026 TYEclipse
