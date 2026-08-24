# dsh-musictheory 🎼

Deterministic music theory math for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) — zero runtime dependencies, pure 12-TET arithmetic.

**中文简介**：音乐理论数学工具箱——解析音名、频率与 MIDI 互转、26 种和弦的正确拼写（G# 大三和弦是 G# B# D# 而非 G# C D#）、17 种音阶的生成（F# 大调含 E#）。零运行时依赖、纯确定计算，专治大模型手算音高/升降号/同音异名的高频错误。

## Why

Agents get music theory wrong in predictable ways:

- `C4` frequency? Often quoted wrong — it's exactly `440 · 2^((60−69)/12) = 261.625565… Hz`.
- `G# major` chord? Frequently written `G# C D#` — the correct spelling is **G# B# D#** (a major third above G# is B#, the leading tone, not C).
- `F# major` scale? Usually missing the **E#** (six sharps, not five).
- `Bb` vs `A#`? Same key on the piano, different meaning on paper — the tools list all conventional enharmonic spellings.

These tools replace all of that with deterministic tables and a spelling engine.

## Tools

| Tool | What it does |
|------|--------------|
| `note_info` | Parse a note name (`C#4`, `Bb3`, `B#4`, `F##4`, `Gx4`) → MIDI number, octave, pitch class, exact 12-TET frequency, and all conventional enharmonic spellings. |
| `freq_to_note` | Frequency in Hz → nearest note, MIDI number, cents deviation, enharmonics. |
| `chord_build` | Correctly spelled chords for **26 qualities** — `maj`, `min`, `dim`, `aug`, `sus2`, `sus4`, `5`, `6`, `m6`, `7`, `maj7`, `m7`, `m7b5`, `dim7`, `aug7`, `7sus4`, `add9`, `madd9`, `maj9`, `9`, `m9`, `11`, `m11`, `13`, `maj13`, `6/9` — with interval labels, MIDI numbers and frequencies. |
| `scale_generate` | Correctly spelled scales for **17 types** — `major`, `natural_minor`, `harmonic_minor`, `melodic_minor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `locrian`, `major_pentatonic`, `minor_pentatonic`, `blues`, `whole_tone`, `chromatic` (plus aliases `ionian`, `minor`, `aeolian`) — with degrees, intervals and frequencies. |

## Install

```bash
dsh plugin --profile <profile-name> add github:TYEclipse/dsh-musictheory
```

(Install from the npm-style git URL, or pin a release: `add github:TYEclipse/dsh-musictheory#v0.1.0`.)

## Examples

```
note_info  note="C#4"           → MIDI 61, octave 4, pitch class 1, 277.18 Hz, also: Db4
freq_to_note  frequencyHz=442   → A4 (MIDI 69), +7.85 cents
chord_build  root="G#" quality="maj"  → G#maj: G#4 B#4 D#5
chord_build  root="C" quality="dim7"  → Cdim7: C4 Eb4 Gb4 Bbb4
scale_generate  root="F#" type="major" → F#4 G#4 A#4 B4 C#5 D#5 E#5
scale_generate  root="C" type="blues"  → C4 Eb4 F4 Gb4 G4 Bb4
```

## How the spelling works

Every chord/scale is a table of letter steps + semitone offsets. A pitch is spelled by
computing the accidental that makes the required letter sound at the target pitch class:

- Root `G#`, major third = letter `B`, target pitch class 0 → **B#** (B's diatonic class is 11, +1 sharp).
- Root `C`, diminished seventh = letter `B`, target class 9 → **Bbb** (double flat).
- Root `Cb`, major = `Cb Eb Gb` — flats follow the root's flat spelling.

Accidentals are never chosen by "nearest black key"; they follow the letter name, which is
exactly where hand-written music theory breaks down.

## Tunings

All tools accept an optional `a4Hz` (and the plugin supports `config.a4Hz`) so you can work
in historical/alternative reference pitches: baroque **415**, Verdi **432**, modern
orchestra **442** Hz. Frequencies follow the 12-TET formula `a4 · 2^((midi−69)/12)`.

## Safety & design

- **Zero runtime dependencies** — pure arithmetic, no network, no shell, no filesystem access.
- Deterministic: same input always gives the same output; no approximation of note names.
- Inputs are validated (malformed notes / non-positive frequencies / unknown qualities return structured errors).
- 41 unit tests, anchored on independently computed 12-TET values (`~/.hermes/scripts/anchors-music.py`) and public references (A4=440 Hz ISO 16, MIDI C4=60).

## Roadmap

- `transpose` — spelling-aware transposition by interval/key (coming in a future release)
- Interval math (compound intervals, inversion)
- More chord qualities & scale types on request — open an issue!

## License

MIT © 2026 TYEclipse
