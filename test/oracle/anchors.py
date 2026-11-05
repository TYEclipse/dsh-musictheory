#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Anchors for dsh-musictheory v0.3.0 (`transpose`, `chord_identify`).

Independent implementation (Python, no TS import) of the two new features, so
every numeric / spelled expectation asserted in `test/music3.test.ts` has an
external source of truth printed here:

  * `transpose`      — letter-ladder spelling of an interval target, up/down,
                       with MIDI number and 12-TET frequency.
  * `chord_identify` — pitch-class set matching against the chord table,
                       ranked by (2 * inversion + quality commonness weight),
                       with root-position and table-order tie-breaks.

Run:  python3 test/oracle/anchors.py          # print all anchors
      python3 test/oracle/anchors.py --check  # verify public facts, rc!=0 on drift

Facts cross-checked against public references: A4 = 440 Hz (ISO 16), MIDI C4 = 60,
C4 = 261.6255653005986 Hz, G# + M3 = B# (not C), C6 <-> Am7 ambiguity.
"""
from __future__ import annotations

import math
import sys

LETTERS = ["C", "D", "E", "F", "G", "A", "B"]
DIATONIC_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
A4 = 440.0

# interval table, independently typed: name -> (quality, number, semitones)
INTERVALS: dict[str, tuple[str, int, int]] = {
    "P1": ("P", 1, 0), "A1": ("A", 1, 1),
    "d2": ("d", 2, 0), "m2": ("m", 2, 1), "M2": ("M", 2, 2), "A2": ("A", 2, 3),
    "d3": ("d", 3, 2), "m3": ("m", 3, 3), "M3": ("M", 3, 4), "A3": ("A", 3, 5),
    "d4": ("d", 4, 4), "P4": ("P", 4, 5), "A4": ("A", 4, 6),
    "d5": ("d", 5, 6), "P5": ("P", 5, 7), "A5": ("A", 5, 8),
    "m6": ("m", 6, 8), "M6": ("M", 6, 9),
    "d7": ("d", 7, 9), "m7": ("m", 7, 10), "M7": ("M", 7, 11),
    "P8": ("P", 8, 12), "A8": ("A", 8, 13),
    "m9": ("m", 9, 13), "M9": ("M", 9, 14),
    "m10": ("m", 10, 15), "M10": ("M", 10, 16),
    "P11": ("P", 11, 17), "A11": ("A", 11, 18),
    "P12": ("P", 12, 19), "m13": ("m", 13, 20), "M13": ("M", 13, 21),
    "P15": ("P", 15, 24),
}
INTERVAL_ALIASES = {"tritone": "A4", "octave": "P8", "unison": "P1", "semitone": "m2", "whole_tone": "M2"}

# chord table, independently encoded as interval-label tuples (see README):
SEMI_OF_LABEL = {
    "1": 0, "b2": 1, "2": 2, "b3": 3, "3": 4, "4": 5, "b5": 6, "#4": 6,
    "5": 7, "#5": 8, "b6": 8, "6": 9, "bb7": 9, "#6": 10, "b7": 10, "7": 11,
    "9": 14, "11": 17, "13": 21,
}
CHORDS: dict[str, tuple[str, ...]] = {
    "maj": ("1", "3", "5"),
    "min": ("1", "b3", "5"),
    "dim": ("1", "b3", "b5"),
    "aug": ("1", "3", "#5"),
    "sus2": ("1", "2", "5"),
    "sus4": ("1", "4", "5"),
    "5": ("1", "5"),
    "6": ("1", "3", "5", "6"),
    "m6": ("1", "b3", "5", "6"),
    "7": ("1", "3", "5", "b7"),
    "maj7": ("1", "3", "5", "7"),
    "m7": ("1", "b3", "5", "b7"),
    "m7b5": ("1", "b3", "b5", "b7"),
    "dim7": ("1", "b3", "b5", "bb7"),
    "aug7": ("1", "3", "#5", "b7"),
    "7sus4": ("1", "4", "5", "b7"),
    "add9": ("1", "3", "5", "9"),
    "madd9": ("1", "b3", "5", "9"),
    "maj9": ("1", "3", "5", "7", "9"),
    "9": ("1", "3", "5", "b7", "9"),
    "m9": ("1", "b3", "5", "b7", "9"),
    "11": ("1", "3", "5", "b7", "11"),
    "m11": ("1", "b3", "5", "b7", "11"),
    "13": ("1", "3", "5", "b7", "13"),
    "maj13": ("1", "3", "5", "7", "13"),
    "6/9": ("1", "3", "5", "6", "9"),
}
QUALITY_WEIGHT = {
    "maj": 0, "min": 0, "dim": 0, "maj7": 0, "m7": 0, "7": 0,
    "m7b5": 1, "dim7": 1, "sus4": 1, "sus2": 1,
    "6": 2, "m6": 2, "5": 2,
    "aug": 3, "aug7": 3, "7sus4": 3, "add9": 3, "madd9": 3,
    "maj9": 4, "9": 4, "m9": 4, "11": 4, "m11": 4, "13": 4, "maj13": 4, "6/9": 4,
}
CHORD_ORDER = list(CHORDS)


def parse_note(text: str, default_octave: int = 4) -> tuple[str, int, int, int] | None:
    """-> (letter, accidental, octave, midi) or None."""
    t = text.strip()
    if not t or t[0].upper() not in LETTERS:
        return None
    letter = t[0].upper()
    rest = t[1:]
    acc = 0
    while rest[:1] in ("#", "b", "x"):
        ch = rest[0]
        acc += 2 if ch == "x" else (1 if ch == "#" else -1)
        rest = rest[1:]
    octave = default_octave
    if rest:
        try:
            octave = int(rest)
        except ValueError:
            return None
    midi = (octave + 1) * 12 + DIATONIC_PC[letter] + acc
    if midi < 0 or midi > 127:
        return None
    return letter, acc, octave, midi


def freq(midi: int) -> float:
    return A4 * 2 ** ((midi - 69) / 12)


def acc_name(diff: int) -> str:
    return {0: "", 1: "#", 2: "##", -1: "b", -2: "bb"}[diff]


def spelled(letter: str, acc: int, midi: int) -> str:
    semitone = DIATONIC_PC[letter] + acc
    octave = (midi - semitone) // 12 - 1
    return f"{letter}{acc_name(acc)}{octave}"


def transpose(name: str, interval: str, direction: str = "ascending", default_octave: int = 4):
    """-> (spelled target, midi, freq) or None for unknown interval/unspellable."""
    parsed = parse_note(name, default_octave)
    if parsed is None:
        return None
    letter, acc, octave, midi = parsed
    canonical = INTERVAL_ALIASES.get(interval, interval)
    if canonical not in INTERVALS:
        return None
    _quality, number, semis = INTERVALS[canonical]
    steps = (number - 1) % 7
    li = LETTERS.index(letter)
    descending = direction == "descending"
    li2 = (li - steps) % 7 if descending else (li + steps) % 7
    root_pc = midi % 12
    pc2 = (root_pc - semis) % 12 if descending else (root_pc + semis) % 12
    midi2 = midi - semis if descending else midi + semis
    if midi2 < 0 or midi2 > 127:
        return None
    diff = (pc2 - DIATONIC_PC[LETTERS[li2]] + 6) % 12 - 6
    if abs(diff) > 2:
        return None
    return spelled(LETTERS[li2], diff, midi2), midi2, freq(midi2)


def chord_pcs(quality: str) -> list[int]:
    return [SEMI_OF_LABEL[label] % 12 for label in CHORDS[quality]]


PCS_INDEX: dict[tuple[int, ...], list[str]] = {}
for _q in CHORD_ORDER:
    PCS_INDEX.setdefault(tuple(sorted(chord_pcs(_q))), []).append(_q)


def identify(notes: list[str], default_octave: int = 4):
    """Pitch-class identification mirroring the TS ranking rule.

    Pass 1 matches the whole pitch-class set exactly; pass 2 (only when pass 1
    finds nothing and at least 3 distinct pitch classes are present) accepts
    incomplete voicings whose pitch classes are a strict subset of a table
    chord's, i.e. one or two chord tones are simply not played (the classic
    "C9 without the fifth" voicing C E Bb D).
    """
    parsed = [parse_note(n, default_octave) for n in notes]
    if any(p is None for p in parsed):
        return None
    written: dict[int, str] = {}
    for p in parsed:
        assert p is not None
        written.setdefault(p[3] % 12, f"{p[0]}{acc_name(p[1])}")
    bass_pc = min(p[3] for p in parsed if p is not None) % 12
    pcs = sorted({p[3] % 12 for p in parsed if p is not None})  # type: ignore[index]

    def make(root_pc: int, quality: str, missing: list[str]):
        seq = chord_pcs(quality)
        rel = (bass_pc - root_pc) % 12
        inv = seq.index(rel) if rel in seq else 0
        symbol = f"{written[root_pc]}{quality}"
        exact = not missing
        score = 2 * inv + QUALITY_WEIGHT[quality] + 3 * len(missing)
        return {
            "root": written[root_pc], "quality": quality, "symbol": symbol,
            "inversion": inv, "score": score,
            "slashSymbol": symbol if inv == 0 else f"{symbol}/{written[bass_pc]}",
            "exact": exact, "missing": missing,
            "tableIndex": CHORD_ORDER.index(quality),
            "rootPc": root_pc, "rootPosition": inv == 0,
        }

    found: list[dict] = []
    for root_pc in pcs:  # an exact match always has its root in the input set
        rel = {(pc - root_pc) % 12 for pc in pcs}
        for quality in PCS_INDEX.get(tuple(sorted(rel)), []):
            found.append(make(root_pc, quality, []))
    mode = "exact"
    if not found and len(pcs) >= 3:
        mode = "incomplete"
        for root_pc in pcs:  # the root itself must be present (no rootless guessing)
            rel = {(pc - root_pc) % 12 for pc in pcs}
            for quality in CHORD_ORDER:
                tones = set(chord_pcs(quality))
                if rel - tones:  # every played pitch class must be a chord tone
                    continue
                absent = tones - rel
                if 1 <= len(absent) <= 2:
                    labels = [lab for lab in CHORDS[quality] if SEMI_OF_LABEL[lab] % 12 in absent]
                    found.append(make(root_pc, quality, labels))
    found.sort(key=lambda c: (c["score"], 0 if c["rootPosition"] else 1, c["tableIndex"], c["rootPc"], c["inversion"]))
    return {"bass": written[bass_pc], "mode": mode, "pcs": pcs, "candidates": found}


TRANSPOSE_CASES = [
    (["C4"], "M3", "ascending"),
    (["Bb3", "G3", "D4"], "M2", "ascending"),
    (["C#4", "E#4", "G#4"], "m3", "descending"),
    (["G#4"], "M3", "ascending"),
    (["F#4"], "P4", "descending"),
    (["Bb3"], "tritone", "ascending"),
    (["C4"], "P15", "ascending"),
    (["A4"], "P8", "descending"),
]

IDENTIFY_CASES = [
    ["C4", "E4", "G4"],
    ["E4", "G4", "C5"],
    ["C4", "E4", "G4", "A4"],
    ["A3", "C4", "E4", "G4"],
    ["C4", "Eb4", "Gb4", "Bbb4"],
    ["C4", "E4", "G#4"],
    ["C4", "G4"],
    ["C4", "E4", "Bb4", "D5"],
    ["D4", "F#4", "A4", "C5", "E5"],
    ["C4", "E4", "G4", "C5"],
    ["C4", "Db4", "E4"],
    ["B#4", "D##5", "F##5"],
]


def _fmt_candidate(c: dict) -> str:
    tag = "" if c["exact"] else f" missing={'/'.join(c['missing'])}"
    return (f"{c['slashSymbol']:<12} root={c['root']:<3} quality={c['quality']:<5} "
            f"inv={c['inversion']} score={c['score']} order={c['tableIndex']}{tag}")


# ===================== scale identification (v0.4.0) =====================
# Scale tables typed from the published definitions (semitone offsets from the
# tonic, and the letter each degree must land on — 0 = same letter as the root).
SCALES: dict[str, tuple[tuple[int, ...], tuple[int, ...]]] = {
    "major": ((0, 2, 4, 5, 7, 9, 11), (0, 1, 2, 3, 4, 5, 6)),
    "natural_minor": ((0, 2, 3, 5, 7, 8, 10), (0, 1, 2, 3, 4, 5, 6)),
    "harmonic_minor": ((0, 2, 3, 5, 7, 8, 11), (0, 1, 2, 3, 4, 5, 6)),
    "melodic_minor": ((0, 2, 3, 5, 7, 9, 11), (0, 1, 2, 3, 4, 5, 6)),
    "dorian": ((0, 2, 3, 5, 7, 9, 10), (0, 1, 2, 3, 4, 5, 6)),
    "phrygian": ((0, 1, 3, 5, 7, 8, 10), (0, 1, 2, 3, 4, 5, 6)),
    "lydian": ((0, 2, 4, 6, 7, 9, 11), (0, 1, 2, 3, 4, 5, 6)),
    "mixolydian": ((0, 2, 4, 5, 7, 9, 10), (0, 1, 2, 3, 4, 5, 6)),
    "locrian": ((0, 1, 3, 5, 6, 8, 10), (0, 1, 2, 3, 4, 5, 6)),
    "major_pentatonic": ((0, 2, 4, 7, 9), (0, 1, 2, 4, 5)),
    "minor_pentatonic": ((0, 3, 5, 7, 10), (0, 2, 3, 4, 6)),
    "blues": ((0, 3, 5, 6, 7, 10), (0, 2, 3, 4, 4, 6)),
    "whole_tone": ((0, 2, 4, 6, 8, 10), (0, 1, 2, 3, 4, 5)),
    "chromatic": ((0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), (0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6)),
}
SCALE_ORDER = list(SCALES)
SCALE_WEIGHT = {
    "major": 0, "natural_minor": 0,
    "dorian": 1, "phrygian": 1, "lydian": 1, "mixolydian": 1, "locrian": 1,
    "harmonic_minor": 1, "melodic_minor": 1,
    "major_pentatonic": 1, "minor_pentatonic": 1, "blues": 1,
    "whole_tone": 2, "chromatic": 4,
}


def root_spellings(pc: int) -> list[tuple[int, int]]:
    """(letter index, accidental) for every spelling within a double accidental."""
    out = []
    for li, letter in enumerate(LETTERS):
        diff = (pc - DIATONIC_PC[letter] + 6) % 12 - 6
        if abs(diff) <= 2:
            out.append((li, diff))
    return out


def spelled_scale(root_letter_index: int, root_acc: int, scale_type: str):
    """Spelled degrees (no octave) or None when a degree needs a triple accidental."""
    semis, letters = SCALES[scale_type]
    root_pc = (DIATONIC_PC[LETTERS[root_letter_index]] + root_acc) % 12
    out: list[str] = []
    for semi, step in zip(semis, letters):
        li = (root_letter_index + step) % 7
        target = (root_pc + semi) % 12
        diff = (target - DIATONIC_PC[LETTERS[li]] + 6) % 12 - 6
        if abs(diff) > 2:
            return None
        out.append(f"{LETTERS[li]}{acc_name(diff)}")
    return out


def name_pc(name: str) -> int:
    letter = name[0]
    acc = name[1:].count("#") - name[1:].count("b")
    return (DIATONIC_PC[letter] + acc) % 12


def identify_scale(notes: list[str], default_octave: int = 4):
    """Fit the scale table to the played notes, ranked like the TS implementation.

    Ranking: missing degrees, spelling agreement with the input, scale-type
    commonness, tonic-is-the-lowest-note, accidental count, root pitch class,
    table order.
    """
    parsed = [parse_note(n, default_octave) for n in notes]
    if any(p is None for p in parsed):
        return None
    written: dict[int, str] = {}
    for p in parsed:
        assert p is not None
        written.setdefault(p[3] % 12, f"{p[0]}{acc_name(p[1])}")
    played = sorted(written)
    if len(played) < 3:
        return None
    played_set = set(played)
    lowest = min(p[3] for p in parsed if p is not None) % 12

    def collect(exact_only: bool) -> list[dict]:
        found = []
        for table_index, scale_type in enumerate(SCALE_ORDER):
            semis, _letters = SCALES[scale_type]
            for pc in played:
                for li, acc in root_spellings(pc):
                    names = spelled_scale(li, acc, scale_type)
                    if names is None:
                        continue
                    degree_pcs = [(pc + s) % 12 for s in semis]
                    degree_set = set(degree_pcs)
                    has_extra = any(p not in degree_set for p in played)
                    missing = [n for n, dpc in zip(names, degree_pcs) if dpc not in played_set]
                    if exact_only:
                        if has_extra or missing:
                            continue
                    else:
                        if has_extra or not missing:
                            continue
                    acc_count = sum(abs(acc_of(n)) for n in names)
                    if acc_count > 7:
                        continue
                    mismatch = sum(1 for n, dpc in zip(names, degree_pcs)
                                   if dpc in written and written[dpc] != n)
                    found.append({
                        "root": names[0], "type": scale_type,
                        "name": f"{names[0]} {scale_type.replace('_', ' ')}",
                        "notes": names, "missing": missing, "exact": not missing,
                        "accidentalCount": acc_count,
                        "score": 3 * len(missing) + acc_count,
                        "rootPc": pc, "tableIndex": table_index,
                        "missingCount": len(missing), "mismatch": mismatch,
                        "rootIsLowest": pc == lowest,
                    })
        return found

    ranked = collect(True)
    mode = "exact"
    if not ranked:
        mode = "contains"
        ranked = collect(False)
    best: dict[tuple[str, int], dict] = {}
    for entry in ranked:
        key = (entry["type"], entry["rootPc"])
        current = best.get(key)
        if current is None or (entry["mismatch"], entry["accidentalCount"]) < (current["mismatch"], current["accidentalCount"]):
            best[key] = entry
    unique = list(best.values())
    unique.sort(key=lambda e: (e["missingCount"], e["mismatch"], SCALE_WEIGHT.get(e["type"], 4),
                               0 if e["rootIsLowest"] else 1, e["accidentalCount"],
                               e["rootPc"], e["tableIndex"]))
    return {"mode": mode, "candidates": unique, "pcs": played}


def acc_of(name: str) -> int:
    return name[1:].count("#") - name[1:].count("b")


# ===================== key signatures (v0.5.0) =====================
# Public reference table: the conventional key names for each circle-of-fifths
# position (7 sharps .. 7 flats). Typed from the standard key list, NOT derived
# from the TS implementation — this is the ruler the implementation is held to.
MAJOR_KEYS = {-7: "Cb", -6: "Gb", -5: "Db", -4: "Ab", -3: "Eb", -2: "Bb", -1: "F",
              0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#"}
MINOR_KEYS = {-7: "Ab", -6: "Eb", -5: "Bb", -4: "F", -3: "C", -2: "G", -1: "D",
              0: "A", 1: "E", 2: "B", 3: "F#", 4: "C#", 5: "G#", 6: "D#", 7: "A#"}
SHARPS = ["F", "C", "G", "D", "A", "E", "B"]
FLATS = ["B", "E", "A", "D", "G", "C", "F"]
MAJOR_STEPS = (0, 2, 4, 5, 7, 9, 11)
MINOR_STEPS = (0, 2, 3, 5, 7, 8, 10)


def tonic_letters_walk(fifths: int, mode: str) -> tuple[int, int]:
    """(letter index, accidental) of the tonic, walked up the ladder from C/A."""
    steps = 4 * fifths if mode == "major" else 4 * fifths - 2
    li = steps % 7
    pc = (7 * fifths if mode == "major" else 7 * fifths - 3) % 12
    diff = (pc - DIATONIC_PC[LETTERS[li]] + 6) % 12 - 6
    return li, diff


def key_name(fifths: int, mode: str) -> str:
    if fifths in (MAJOR_KEYS if mode == "major" else MINOR_KEYS):
        tonic = (MAJOR_KEYS if mode == "major" else MINOR_KEYS)[fifths]
    else:
        li, diff = tonic_letters_walk(fifths, mode)
        tonic = f"{LETTERS[li]}{acc_name(diff)}"
    return f"{tonic} {mode}"


def signature_accidentals(fifths: int) -> list[str]:
    order = SHARPS if fifths > 0 else FLATS
    sign = 1 if fifths > 0 else -1
    return [f"{order[i % 7]}{acc_name(sign * (2 if i >= 7 else 1))}" for i in range(abs(fifths))]


def key_signature(fifths: int, mode: str = "major") -> dict:
    li, diff = tonic_letters_walk(fifths, mode)
    tonic_pc = (DIATONIC_PC[LETTERS[li]] + diff) % 12
    steps = MAJOR_STEPS if mode == "major" else MINOR_STEPS
    notes = []
    for i, semi in enumerate(steps):
        nli = (li + i) % 7
        target = (tonic_pc + semi) % 12
        d = (target - DIATONIC_PC[LETTERS[nli]] + 6) % 12 - 6
        assert abs(d) <= 2, (fifths, mode, i)
        notes.append(f"{LETTERS[nli]}{acc_name(d)}")
    count = abs(fifths)
    other = "minor" if mode == "major" else "major"
    parallel_fifths = fifths + (-3 if mode == "major" else 3)
    enh = None
    if fifths != 0:
        flipped = fifths - 12 if fifths > 0 else fifths + 12
        if abs(flipped) <= 7:
            enh = key_name(flipped, mode)
    return {
        "key": f"{key_name(fifths, mode)}", "tonic": key_name(fifths, mode).split(" ")[0],
        "mode": mode, "fifths": fifths, "accidentals": signature_accidentals(fifths),
        "accidentalCount": count, "signature": "no accidentals" if count == 0 else
        f"{count} {'sharp' if fifths > 0 else 'flat'}{'' if count == 1 else 's'}",
        "relative": key_name(fifths, other), "parallel": key_name(parallel_fifths, other),
        "enharmonic": enh, "practical": count <= 7, "notes": notes, "tonicPc": tonic_pc,
    }


# ===================== roman numeral analysis (v0.5.0) =====================
# Suffix -> (canonical quality, uppercase?, roman suffix). Typed independently
# of the TS table (the TS side keys off its own chord table).
ROMAN_QUALITIES = {
    "": ("maj", True, ""), "maj": ("maj", True, ""), "M": ("maj", True, ""),
    "major": ("maj", True, ""),
    "m": ("min", False, ""), "min": ("min", False, ""), "minor": ("min", False, ""),
    "-": ("min", False, ""),
    "dim": ("dim", False, "°"), "°": ("dim", False, "°"), "o": ("dim", False, "°"),
    "aug": ("aug", True, "+"), "+": ("aug", True, "+"),
    "6": ("6", True, "6"), "m6": ("m6", False, "6"), "min6": ("m6", False, "6"), "-6": ("m6", False, "6"),
    "7": ("7", True, "7"), "dom7": ("7", True, "7"),
    "maj7": ("maj7", True, "maj7"), "M7": ("maj7", True, "maj7"), "Δ7": ("maj7", True, "maj7"),
    "m7": ("m7", False, "7"), "min7": ("m7", False, "7"), "-7": ("m7", False, "7"),
    "m7b5": ("m7b5", False, "ø7"), "ø": ("m7b5", False, "ø7"), "ø7": ("m7b5", False, "ø7"),
    "min7b5": ("m7b5", False, "ø7"),
    "dim7": ("dim7", False, "°7"), "°7": ("dim7", False, "°7"), "o7": ("dim7", False, "°7"),
    "aug7": ("aug7", True, "+7"),
    "sus2": ("sus2", True, "sus2"), "sus4": ("sus4", True, "sus4"), "5": ("5", True, "5"),
    "add9": ("add9", True, "add9"), "madd9": ("madd9", False, "add9"),
    "maj9": ("maj9", True, "maj9"), "9": ("9", True, "9"), "m9": ("m9", False, "9"),
    "min9": ("m9", False, "9"), "-9": ("m9", False, "9"),
    "11": ("11", True, "11"), "m11": ("m11", False, "11"), "min11": ("m11", False, "11"),
    "13": ("13", True, "13"), "maj13": ("maj13", True, "maj13"), "6/9": ("6/9", True, "6/9"),
    "7sus4": ("7sus4", True, "7sus4"),
}
ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII"]
# quality -> (uppercase?, roman suffix), derived from the suffix table above.
ROMAN_BY_QUALITY = {}
for _suffix_text, (_q, _upper, _suf) in ROMAN_QUALITIES.items():
    ROMAN_BY_QUALITY.setdefault(_q, (_upper, _suf))
TRIAD_QUALITIES = {"maj", "min", "dim", "aug"}
SEVENTH_QUALITIES = {"7", "maj7", "m7", "m7b5", "dim7", "aug7"}


def parse_chord_symbol(sym: str):
    """-> (root letter index, root accidental, quality, slash bass) or None."""
    t = sym.strip()
    if not t or t[0].upper() not in LETTERS:
        return None
    letter = t[0].upper()
    rest = t[1:]
    acc = 0
    while rest[:1] in ("#", "b", "x"):
        ch = rest[0]
        acc += 2 if ch == "x" else (1 if ch == "#" else -1)
        rest = rest[1:]
    bass = None
    if "/" in rest:
        head, _, tail = rest.rpartition("/")
        if head in ROMAN_QUALITIES and parse_note(tail) is not None:
            rest = head
            bass = tail.strip()
    if rest not in ROMAN_QUALITIES:
        return None
    return LETTERS.index(letter), acc, ROMAN_QUALITIES[rest][0], bass


def analyze_roman(key_spec: str, symbols: list[str]):
    """Independent roman-numeral analysis (no TS import)."""
    parts = key_spec.strip().split()
    tonic_name = parts[0]
    mode = "minor" if len(parts) > 1 and parts[1].lower().startswith("m") and not parts[1].lower().startswith("maj") else "major"
    parsed = parse_note(tonic_name)
    if parsed is None:
        return None
    letter, acc, _o, _m = parsed
    li = LETTERS.index(letter)
    tonic_pc = (DIATONIC_PC[letter] + acc) % 12
    steps = MINOR_STEPS if mode == "minor" else MAJOR_STEPS
    scale_pcs = [(tonic_pc + s) % 12 for s in steps]
    scale_set = set(scale_pcs)
    out = []
    for sym in symbols:
        pc = parse_chord_symbol(sym)
        if pc is None:
            return None
        root_li, root_acc, quality, bass = pc
        root_pc = (DIATONIC_PC[LETTERS[root_li]] + root_acc) % 12
        degree = (root_li - li) % 7
        diff = (root_pc - scale_pcs[degree] + 6) % 12 - 6
        if abs(diff) > 2:
            return None
        upper, suffix = ROMAN_BY_QUALITY[quality]
        prefix = "#" * diff if diff > 0 else "b" * (-diff)
        base = ROMANS[degree] if upper else ROMANS[degree].lower()
        numeral = f"{prefix}{base}"
        roman = f"{numeral}{suffix}"
        chord_pcs = [(root_pc + SEMI_OF_LABEL[label]) % 12 for label in CHORDS[quality]]
        chord_pcs = list(dict.fromkeys(chord_pcs))
        in_key = all(p in scale_set for p in chord_pcs)
        size = len(chord_pcs)
        if size in (3, 4):
            diatonic_set = [scale_pcs[(degree + 2 * j) % 7] for j in range(size)]
            diatonic = sorted(diatonic_set) == sorted(chord_pcs)
        else:
            diatonic = in_key
        tri = [(scale_pcs[(degree + 2) % 7] - scale_pcs[degree]) % 12,
               (scale_pcs[(degree + 4) % 7] - scale_pcs[degree]) % 12]
        key_triad_quality = {(4, 7): "maj", (3, 7): "min", (3, 6): "dim", (4, 8): "aug"}.get(tuple(tri), "other")
        key_triad = {"maj": ROMANS[degree], "min": ROMANS[degree].lower(),
                     "dim": ROMANS[degree].lower() + "°", "aug": ROMANS[degree] + "+"}.get(key_triad_quality, "?")
        notes = []
        for label in CHORDS[quality]:
            semi = SEMI_OF_LABEL[label]
            # letter step: derived from the interval label's degree
            number = int("".join(ch for ch in label if ch.isdigit()))
            step = (number - 1) % 7
            nli = (root_li + step) % 7
            target = (root_pc + semi) % 12
            d = (target - DIATONIC_PC[LETTERS[nli]] + 6) % 12 - 6
            notes.append(f"{LETTERS[nli]}{acc_name(d)}")
        entry = {"symbol": sym, "degree": degree + 1, "accidental": diff, "roman": roman,
                 "inKey": in_key, "diatonic": diatonic, "keyTriad": key_triad,
                 "notes": notes, "root": f"{LETTERS[root_li]}{acc_name(root_acc)}", "quality": quality}
        if bass is not None:
            bp = parse_note(bass)
            assert bp is not None
            bl, bacc, _bo, _bm = bp
            bli = LETTERS.index(bl)
            bpc = (DIATONIC_PC[bl] + bacc) % 12
            if bpc in chord_pcs:
                inv = chord_pcs.index(bpc)
                tones = len(chord_pcs)
                figured = None
                if tones == 3 and quality in TRIAD_QUALITIES:
                    figured = f"{numeral}{suffix}{['', '6', '64'][inv]}"
                elif tones == 4 and quality in SEVENTH_QUALITIES:
                    figured = f"{numeral}{suffix[:-1]}{['', '65', '43', '42'][inv]}"
                entry["roman"] = figured if figured is not None else f"{numeral}{suffix}/{bl}{acc_name(bacc)}"
                entry["inversion"] = inv
                entry["bassInChord"] = True
            else:
                entry["roman"] = f"{numeral}{suffix}/{bl}{acc_name(bacc)}"
                entry["bassInChord"] = False
            entry["bass"] = f"{LETTERS[bli]}{acc_name(bacc)}"
        out.append(entry)
    return {"key": f"{key_name_from_tonic(li, acc, mode)}", "mode": mode, "chords": out,
            "progression": " ".join(c["roman"] for c in out),
            "diatonicCount": sum(1 for c in out if c["diatonic"])}


def key_name_from_tonic(letter_index: int, accidental: int, mode: str) -> str:
    for fifths in range(-11, 12):
        li, diff = tonic_letters_walk(fifths, mode)
        if li == letter_index and diff == accidental:
            return f"{LETTERS[li]}{acc_name(diff)} {mode}"
    return f"{LETTERS[letter_index]}{acc_name(accidental)} {mode}"


KEY_CASES = [("C major", 0, "major"), ("Eb major", -3, "major"), ("F# minor", 3, "minor"),
             ("C# major", 7, "major"), ("Cb major", -7, "major"), ("A minor", 0, "minor"),
             ("G# major", 8, "major"), ("Cb minor", -10, "minor"), ("E major", 4, "major")]

ROMAN_CASES = [
    ("C major", ["Am", "F", "C", "G"]),
    ("C major", ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]),
    ("A minor", ["Am", "Dm", "E", "Am"]),
    ("A minor", ["Am", "Dm", "Em", "Am"]),
    ("C major", ["A#", "Bb"]),
    ("C major", ["C/E", "G7/F", "C/D"]),
    ("F# major", ["F#", "B", "C#"]),
    ("E major", ["Am"]),
    ("C major", ["Cmaj7", "Am7", "Dm7", "G7"]),
]


SCALE_CASES = [
    ["C4", "D4", "E4", "F4", "G4", "A4", "B4"],
    ["C4", "D4", "E4", "F#4", "G4", "A4", "B4"],
    ["A3", "B3", "C4", "D4", "E4", "F4", "G#4"],
    ["C#4", "D#4", "E#4", "F#4", "G#4", "A#4", "B#4"],
    ["Bb3", "C4", "D4", "Eb4", "F4", "G4", "A4"],
    ["C4", "D4", "E4", "G4", "A4"],
    ["C4", "Eb4", "F4", "Gb4", "G4", "Bb4"],
    ["C4", "D4", "E4", "F#4", "G#4", "A#4"],
    ["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"],
    ["C4", "E4", "G4"],
    ["G3", "C4", "E4"],
    ["C4", "E4", "G4", "A4"],
]


def cents(f: float, midi: int, a4: float = 440.0) -> float:
    return 1200 * math.log2(f / (a4 * 2 ** ((midi - 69) / 12)))


def midi_of(name: str) -> int:
    parsed = parse_note(name)
    assert parsed is not None, name
    return parsed[3]


def freq_at(midi: int, a4: float = A4) -> float:
    return a4 * 2 ** ((midi - 69) / 12)


def legacy_anchors() -> list[str]:
    """Anchors asserted by test/music.test.ts (v0.1/v0.2 suite)."""
    out: list[str] = []
    out.append(f"MIDI numbers: C4={midi_of('C4')} A4={midi_of('A4')} Bb={midi_of('Bb')} "
               f"B#4={midi_of('B#4')} Cb4={midi_of('Cb4')} F##4={midi_of('F##4')} "
               f"Gx4={midi_of('Gx4')} Ebb4={midi_of('Ebb4')}")
    out.append(f"pitch classes: B#4={midi_of('B#4') % 12} Cb4={midi_of('Cb4') % 12}")
    out.append(f"frequencies @A4=440: midi69={freq(69)!r} midi60={freq(60)!r} midi61={freq(61)!r} midi57={freq(57)!r}")
    out.append(f"frequencies @A4=415/442/432: midi60@415={freq_at(60, 415)!r} "
               f"midi69@442={freq_at(69, 442)!r} midi60@432={freq_at(60, 432)!r}")
    out.append("Cmaj7 frequencies: " + " ".join(repr(freq_at(m)) for m in (60, 64, 67, 71)))
    out.append(f"cents: 442Hz vs A4@440={cents(442, 69)!r}, 261.63Hz vs C4@440={cents(261.63, 60)!r}, "
               f"440Hz vs A4@440={cents(440, 69)!r}")
    out.append(f"chord table size: {len(CHORDS)} qualities")
    out.append(f"G#maj midis: [68, 72, 75]  Cdim7 fourth midi: {midi_of('Bbb4')}")
    out.append(f"note_info C#4: midi {midi_of('C#4')}, octave 4, pitch class {midi_of('C#4') % 12}, {freq(61)!r} Hz")
    out.append(f"freq_to_note 442 Hz: midi {midi_of('A4')}, {cents(442, 69)!r} cents")
    out.append("tool count after v0.3.0: 9 (7 existing + transpose + chord_identify)")
    return out


def main(argv: list[str]) -> int:
    if "--check" in argv:
        checks = [
            (transpose("C4", "M3"), ("E4", 64, 329.6275569128699)),
            (transpose("G#4", "M3"), ("B#4", 72, 523.2511306011972)),
            (transpose("C4", "P1"), ("C4", 60, 261.6255653005986)),
            (transpose("B8", "M9"), None),
            (transpose("C4", "X9"), None),
        ]
        ok = True
        for got, want in checks:
            if got is None or want is None:
                good = (got is None) == (want is None)
            else:
                good = got[0] == want[0] and got[1] == want[1] and math.isclose(got[2], want[2], rel_tol=1e-12)
            print(f"{'✅' if good else '❌'} {want} vs {got}")
            ok = ok and good
        cmaj = identify(["C4", "E4", "G4"])
        best = cmaj["candidates"][0] if cmaj else None
        good = best is not None and best["symbol"] == "Cmaj" and best["inversion"] == 0
        print(f"{'✅' if good else '❌'} C-E-G -> {best['symbol'] if best else None} (root position)")
        ok = ok and good
        amb = identify(["C4", "E4", "G4", "A4"])
        syms = [c["symbol"] for c in amb["candidates"]] if amb else []
        good = syms == ["C6", "Am7"]
        print(f"{'✅' if good else '❌'} C-E-G-A -> {syms} (C6 <-> Am7 ambiguity)")
        ok = ok and good
        # --- scale_identify (v0.4.0) ---
        cmaj_set = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"]
        r = identify_scale(cmaj_set)
        best = r["candidates"][0] if r else None
        good = (best is not None and best["name"] == "C major"
                and best["notes"] == ["C", "D", "E", "F", "G", "A", "B"]
                and best["accidentalCount"] == 0 and r["mode"] == "exact")
        print(f"{'✅' if good else '❌'} C major set -> {best['name'] if best else None} "
              f"{best['notes'] if best else None} acc={best['accidentalCount'] if best else None}")
        ok = ok and good
        # seven diatonic modes of one pitch-class set
        good = r is not None and len(r["candidates"]) == 7
        print(f"{'✅' if good else '❌'} C major set -> {len(r['candidates']) if r else 0} exact readings (7 modes)")
        ok = ok and good
        # every exact reading must carry exactly the played pitch classes
        exact_pcs = {name_pc(n) for n in cmaj_set}
        for c in (r["candidates"] if r else []):
            if {name_pc(n) for n in c["notes"]} != exact_pcs:
                good = False
                print(f"❌ {c['name']} pitch classes drift")
                break
        else:
            print("✅ every exact reading carries exactly the played pitch classes")
        ok = ok and good
        # spelling agreement: sharps stay sharps
        r_sharp = identify_scale(["C#4", "D#4", "E#4", "F#4", "G#4", "A#4", "B#4"])
        best_sharp = r_sharp["candidates"][0] if r_sharp else None
        good = (best_sharp is not None and best_sharp["name"] == "C# major"
                and best_sharp["accidentalCount"] == 7
                and best_sharp["notes"] == ["C#", "D#", "E#", "F#", "G#", "A#", "B#"])
        print(f"{'✅' if good else '❌'} C# major set -> {best_sharp['name'] if best_sharp else None} "
              f"acc={best_sharp['accidentalCount'] if best_sharp else None}")
        ok = ok and good
        # minor pentatonic is the same five pitch classes as its relative major pentatonic
        r_pent = identify_scale(["C4", "D4", "E4", "G4", "A4"])
        names = [c["name"] for c in r_pent["candidates"]] if r_pent else []
        good = names == ["C major pentatonic", "A minor pentatonic"]
        print(f"{'✅' if good else '❌'} C D E G A -> {names} (pentatonic pair)")
        ok = ok and good
        # harmonic minor is unambiguous within the table
        r_harm = identify_scale(["A3", "B3", "C4", "D4", "E4", "F4", "G#4"])
        good = r_harm is not None and len(r_harm["candidates"]) == 1 and r_harm["candidates"][0]["name"] == "A harmonic minor"
        print(f"{'✅' if good else '❌'} A harmonic minor set -> {[c['name'] for c in r_harm['candidates']] if r_harm else None}")
        ok = ok and good
        # a chord is not a scale: it falls back to "contains" and names the missing degrees
        r_triad = identify_scale(["C4", "E4", "G4"])
        best_triad = r_triad["candidates"][0] if r_triad else None
        good = (best_triad is not None and r_triad["mode"] == "contains"
                and best_triad["name"] == "C major pentatonic"
                and best_triad["missing"] == ["D", "A"])
        print(f"{'✅' if good else '❌'} C E G -> {best_triad['name'] if best_triad else None} "
              f"missing={best_triad['missing'] if best_triad else None}")
        ok = ok and good
        # every "contains" reading must include every played pitch class
        played_pcs = {name_pc(n) for n in ["C4", "E4", "G4"]}
        for c in (r_triad["candidates"] if r_triad else []):
            if not played_pcs <= {name_pc(n) for n in c["notes"]}:
                good = False
                print(f"❌ {c['name']} drops a played pitch class")
                break
        else:
            print("✅ every 'contains' reading includes every played pitch class")
        ok = ok and good

        # --- key_signature (v0.5.0) ---
        # published key tables are the ruler: practical signatures must match
        mismatches = []
        for fifths in range(-7, 8):
            sig = key_signature(fifths, "major")
            if sig["tonic"] != MAJOR_KEYS[fifths] or sig["relative"] != f"{MINOR_KEYS[fifths]} minor":
                mismatches.append(f"{fifths}:{sig['tonic']}/{sig['relative']}")
        good = not mismatches
        print(f"{'✅' if good else '❌'} 15 major keys match the published circle-of-fifths table"
              + ("" if good else f" — drift {mismatches}"))
        ok = ok and good
        # accidental count, order and uniqueness for every spellable signature
        problems = []
        for fifths in range(-11, 12):
            sig = key_signature(fifths, "major")
            if sig["accidentalCount"] != abs(fifths):
                problems.append(f"{fifths}: count {sig['accidentalCount']}")
            if len(set(sig["accidentals"])) != len(sig["accidentals"]):
                problems.append(f"{fifths}: duplicate accidentals")
            order = SHARPS if fifths > 0 else FLATS
            if any(a[0] != order[i % 7] for i, a in enumerate(sig["accidentals"])):
                problems.append(f"{fifths}: order")
        good = not problems
        print(f"{'✅' if good else '❌'} every signature carries |fifths| accidentals in written order"
              + ("" if good else f" — {problems[:4]}"))
        ok = ok and good
        # a key's scale must be exactly the definitional scale of its tonic
        problems = []
        for fifths in range(-11, 12):
            for mode in ("major", "minor"):
                sig = key_signature(fifths, mode)
                steps = MAJOR_STEPS if mode == "major" else MINOR_STEPS
                want = {(sig["tonicPc"] + s) % 12 for s in steps}
                got = {name_pc(n) for n in sig["notes"]}
                if got != want or len(sig["notes"]) != 7:
                    problems.append(f"{fifths}{mode[0]}: {sorted(got)} vs {sorted(want)}")
                if any(abs(acc_of(n)) > 2 for n in sig["notes"]):
                    problems.append(f"{fifths}{mode[0]}: needs a triple accidental")
        good = not problems
        print(f"{'✅' if good else '❌'} every key's spelled scale equals the definitional scale of its tonic"
              + ("" if good else f" — {problems[:4]}"))
        ok = ok and good
        # relative keys share the signature, parallel keys share the tonic
        problems = []
        for fifths in range(-7, 8):
            for mode in ("major", "minor"):
                sig = key_signature(fifths, mode)
                other = "minor" if mode == "major" else "major"
                rel = key_signature(fifths, other)
                par = key_signature(fifths + (-3 if mode == "major" else 3), other)
                if sig["relative"] != rel["key"] or sig["parallel"] != par["key"]:
                    problems.append(f"{fifths}{mode[0]}")
                if par["tonic"] != sig["tonic"]:
                    problems.append(f"{fifths}{mode[0]}: parallel tonic {par['tonic']} != {sig['tonic']}")
        good = not problems
        print(f"{'✅' if good else '❌'} relative keys share the signature and parallel keys share the tonic"
              + ("" if good else f" — {problems[:4]}"))
        ok = ok and good
        # enharmonic spellings must sound alike
        problems = []
        for fifths in range(-11, 12):
            sig = key_signature(fifths, "major")
            if sig["enharmonic"] is not None:
                enh_fifths = [f for f in range(-11, 12) if key_name(f, "major") == sig["enharmonic"]]
                if not enh_fifths or key_signature(enh_fifths[0], "major")["tonicPc"] != sig["tonicPc"]:
                    problems.append(f"{fifths}->{sig['enharmonic']}")
        good = not problems
        print(f"{'✅' if good else '❌'} every reported enharmonic key has the same tonic pitch class"
              + ("" if good else f" — {problems}"))
        ok = ok and good

        # --- roman_numeral (v0.5.0) ---
        # the seven diatonic triads of every practical key must analyze as diatonic
        problems = []
        expected_major = ["I", "ii", "iii", "IV", "V", "vi", "vii°"]
        expected_minor = ["i", "ii°", "III", "iv", "v", "VI", "VII"]
        for fifths in range(-7, 8):
            for mode in ("major", "minor"):
                sig = key_signature(fifths, mode)
                triads = []
                for i, root in enumerate(sig["notes"]):
                    third = sig["notes"][(i + 2) % 7]
                    fifth = sig["notes"][(i + 4) % 7]
                    t_interval = (name_pc(third) - name_pc(root)) % 12
                    f_interval = (name_pc(fifth) - name_pc(root)) % 12
                    quality = {(4, 7): "", (3, 7): "m", (3, 6): "dim", (4, 8): "aug"}[(t_interval, f_interval)]
                    triads.append(f"{root}{quality}")
                res = analyze_roman(sig["key"], triads)
                if res is None:
                    problems.append(f"{sig['key']}: unparsable")
                    continue
                want = expected_major if mode == "major" else expected_minor
                if [c["roman"] for c in res["chords"]] != want:
                    problems.append(f"{sig['key']}: {[c['roman'] for c in res['chords']]}")
                if not all(c["diatonic"] for c in res["chords"]):
                    problems.append(f"{sig['key']}: a diatonic triad is not marked diatonic")
        good = not problems
        print(f"{'✅' if good else '❌'} all 30 practical keys: their own 7 triads come back diatonic in order"
              + ("" if good else f" — {problems[:3]}"))
        ok = ok and good
        # spelling decides the degree, not the pitch class
        res = analyze_roman("C major", ["A#", "Bb"])
        good = [c["roman"] for c in res["chords"]] == ["#VI", "bVII"]
        print(f"{'✅' if good else '❌'} C major A#/Bb -> {[c['roman'] for c in res['chords']]} (#VI / bVII)")
        ok = ok and good
        # figured bass and non-chord bass
        res = analyze_roman("C major", ["C/E", "G7/F", "C/D"])
        figures = [(c["roman"], c.get("inversion"), c.get("bassInChord")) for c in res["chords"]]
        good = figures == [("I6", 1, True), ("V42", 3, True), ("I/D", None, False)]
        print(f"{'✅' if good else '❌'} figured bass: {figures}")
        ok = ok and good
        # a borrowed major V in a minor key stays a V and is flagged out of key
        res = analyze_roman("A minor", ["E"])
        only = res["chords"][0]
        good = only["roman"] == "V" and only["inKey"] is False and only["diatonic"] is False
        print(f"{'✅' if good else '❌'} A minor + E -> {only['roman']} inKey {only['inKey']} diatonic {only['diatonic']}")
        ok = ok and good
        # every analysis keeps the chord tones spelled on their own letters
        res = analyze_roman("F# major", ["F#", "B", "C#"])
        good = [c["notes"] for c in res["chords"]] == [["F#", "A#", "C#"], ["B", "D#", "F#"], ["C#", "E#", "G#"]]
        print(f"{'✅' if good else '❌'} F# major I IV V spellings: {[c['notes'] for c in res['chords']]}")
        ok = ok and good

        return 0 if ok else 1

    print("=" * 72)
    print("transpose anchors")
    print("=" * 72)
    print("interval sizes: " + " ".join(f"{n}={INTERVALS[n][2]}" for n in ("M2", "M3", "m3", "A4", "P4", "P8", "P15")))
    print(f"freq at A4=415: midi72={freq_at(72, 415)!r} midi60={freq_at(60, 415)!r}")
    for notes, interval, direction in TRANSPOSE_CASES:
        print(f"\n{notes}  {interval} {direction}")
        for note in notes:
            got = transpose(note, interval, direction)
            if got is None:
                print(f"  {note:<5} -> None")
            else:
                print(f"  {note:<5} -> {got[0]:<5} midi {got[1]:<4} {got[2]!r}")

    print()
    print("=" * 72)
    print("chord_identify anchors")
    print("=" * 72)
    for notes in IDENTIFY_CASES:
        result = identify(notes)
        if result is None:
            print(f"\n{notes} -> unparsable")
            continue
        print(f"\n{notes}  (bass {result['bass']}, mode {result['mode']}, "
              f"pitch classes {result['pcs']}, total {len(result['candidates'])})")
        for c in result["candidates"]:
            print("  " + _fmt_candidate(c))
    print()
    print("=" * 72)
    print("scale_identify anchors")
    print("=" * 72)
    for notes in SCALE_CASES:
        result = identify_scale(notes)
        if result is None:
            print(f"\n{notes} -> unparsable")
            continue
        print(f"\n{notes}  (mode {result['mode']}, pitch classes {result['pcs']}, "
              f"total {len(result['candidates'])})")
        for c in result["candidates"]:
            miss = "" if c["exact"] else f" missing={' '.join(c['missing'])}"
            print(f"  {c['name']:<26} root={c['root']:<3} acc={c['accidentalCount']} "
                  f"score={c['score']} notes={' '.join(c['notes'])}{miss}")
    print()
    print("=" * 72)
    print("key_signature anchors (v0.5.0)")
    print("=" * 72)
    for label, fifths, mode in KEY_CASES:
        sig = key_signature(fifths, mode)
        print(f"\n{label}  (fifths {sig['fifths']}, accidentalCount {sig['accidentalCount']}, "
              f"practical {sig['practical']}, tonicPc {sig['tonicPc']})")
        print(f"  signature: {sig['signature']}  accidentals: {' '.join(sig['accidentals']) or '(none)'}")
        print(f"  relative: {sig['relative']}  parallel: {sig['parallel']}  enharmonic: {sig['enharmonic']}")
        print(f"  tonic: {sig['tonic']}  mode: {sig['mode']}")
        print(f"  notes: {' '.join(sig['notes'])}")
    print()
    print("=" * 72)
    print("roman_numeral anchors (v0.5.0)")
    print("=" * 72)
    for key, chords in ROMAN_CASES:
        res = analyze_roman(key, chords)
        print(f"\n{key}: {' '.join(chords)} -> {res['progression']}  (diatonicCount {res['diatonicCount']})")
        for c in res["chords"]:
            extra = ""
            if "inversion" in c:
                extra += f" inversion {c['inversion']}"
            if "bassInChord" in c:
                extra += f" bassInChord {c['bassInChord']}"
            print(f"  {c['symbol']:<6} degree {c['degree']} accidental {c['accidental']} "
                  f"roman {c['roman']:<8} inKey {c['inKey']} diatonic {c['diatonic']} "
                  f"triad {c['keyTriad']:<4} notes {' '.join(c['notes'])}{extra}")
    print()
    print("=" * 72)
    print("legacy anchors (test/music.test.ts)")
    print("=" * 72)
    for line in legacy_anchors():
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
