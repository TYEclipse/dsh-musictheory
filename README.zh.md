# dsh-musictheory 🎼

DeepSeek Harness（`dsh`）的音乐理论数学工具箱——零运行时依赖，纯 12 平均律算术。

## 为什么需要它

大模型心算音乐理论时有规律地出错：

- `C4` 的频率常被算错——精确值是 `440 · 2^((60−69)/12) = 261.625565… Hz`
- `G#` 大三和弦常被写成 `G# C D#`——正确拼写是 **G# B# D#**（G# 上方大三度是 B#，不是 C）
- `F#` 大调音阶常漏掉 **E#**（六个升号，不是五个）
- 同音异名（`Bb` vs `A#`）在五线谱上含义不同

本插件用确定性表格 + 拼写引擎全部代劳。

## 工具

| 工具 | 功能 |
|------|------|
| `note_info` | 解析音名（`C#4`、`Bb3`、`B#4`、`F##4`、`Gx4`）→ MIDI 号、八度、音级、12-TET 频率、全部常规同音异名拼写 |
| `freq_to_note` | 频率(Hz) → 最近音符、MIDI 号、音分偏差、同音异名 |
| `chord_build` | **26 种**和弦质量（maj/min/dim/aug/sus2/sus4/5/6/m6/7/maj7/m7/m7b5/dim7/aug7/7sus4/add9/madd9/maj9/9/m9/11/m11/13/maj13/6/9）的正确拼写 + 音程标注 + MIDI + 频率 |
| `scale_generate` | **17 种**音阶（大调/自然小调/和声小调/旋律小调/多利亚/弗里几亚/利底亚/混合利底亚/洛克里亚/大小五声/布鲁斯/全音/半音，含 ionian/minor/aeolian 别名）的正确拼写 + 级数 + 音程 + 频率 |

## 安装

```bash
dsh plugin --profile <profile-name> add github:TYEclipse/dsh-musictheory
```

## 示例

```
note_info  note="C#4"           → MIDI 61, 八度 4, 音级 1, 277.18 Hz, 又名: Db4
freq_to_note  frequencyHz=442   → A4 (MIDI 69), +7.85 音分
chord_build  root="G#" quality="maj"  → G#maj: G#4 B#4 D#5
chord_build  root="C" quality="dim7"  → Cdim7: C4 Eb4 Gb4 Bbb4
scale_generate  root="F#" type="major" → F#4 G#4 A#4 B4 C#5 D#5 E#5
scale_generate  root="C" type="blues"  → C4 Eb4 F4 Gb4 G4 Bb4
```

## 拼写原理

每个和弦/音阶都是「音名字母步进 + 半音偏移」的表格；拼写引擎计算让目标字母
落在目标音级上所需的变音记号——变音记号永远跟着音名走（G# 的三度是 B 音位 → B#；
C 的减七度是 B 音位 → Bbb），这正是手写乐理最容易错的地方。

## 律制

所有工具支持 `a4Hz` 参数（插件配置 `config.a4Hz`）——巴洛克 415、威尔第 432、
现代乐团 442 Hz 等均可；频率按 `a4 · 2^((midi−69)/12)` 计算。

## 安全与设计

- 零运行时依赖：纯算术，无网络、无 shell、无文件访问
- 确定性输出；非法输入返回结构化错误
- 41 个单元测试，锚点由独立闭式脚本（`~/.hermes/scripts/anchors-music.py`）定值并与公开标准交叉验证

## 路线图

- `transpose`：按音程/调性的拼写感知移调（后续版本）
- 音程数学（复音程、转位）
- 更多和弦/音阶类型——开 issue 提需求！

## 许可证

MIT © 2026 TYEclipse
