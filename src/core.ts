/**
 * dsh-musictheory core — deterministic 12-TET music theory math.
 *
 * Zero-dependency pure arithmetic:
 *   - note parsing (letter + accidentals + octave, e.g. "C#4", "B#4", "Cb4", "F##4", "Gx4")
 *   - pitch-class spelling engine (correct accidentals: G# major third is B#, not C)
 *   - chord construction (26 qualities) and scale generation (17 types)
 *   - frequency <-> MIDI conversion with configurable A4 reference pitch
 *
 * @module dsh-musictheory/core
 */

/** The seven letter names with their diatonic pitch classes (C=0, D=2, ...). */
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
export const DIATONIC_PC: Readonly<Record<string, number>> = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
})

/** Default A4 reference pitch in Hz (ISO 16). */
export const DEFAULT_A4 = 440

/** MIDI note number of A4. */
export const MIDI_A4 = 69

/** A parsed note: letter + accidental offset + octave resolved to a MIDI number. */
export interface ParsedNote {
  /** Uppercase letter, one of A-G. */
  letter: string
  /** Index into LETTERS (C=0 ... B=6). */
  letterIndex: number
  /** Accidental in semitones: -2 (bb) ... +2 (##/x). */
  accidental: number
  /** Octave label as written (default 4 when omitted). */
  octave: number
  /** Absolute MIDI note number (0-127). */
  midi: number
  /** Pitch class 0-11 (C=0). */
  pc: number
}

const NOTE_RE = /^([A-Ga-g])((?:#{1,2}|x|b{1,2}))?(-?\d+)?$/

function accidentalSemis(acc: string): number {
  switch (acc) {
    case '#': return 1
    case '##': return 2
    case 'x': return 2
    case 'b': return -1
    case 'bb': return -2
    default: return 0
  }
}

/**
 * Parse a note name like "C#4", "Db4", "B#4", "F##4", "Gx4" or bare "C".
 * Octave defaults to `defaultOctave` when omitted. Returns null when the
 * spelling is malformed or the resolved MIDI number is out of range.
 */
export function parseNote(input: string, defaultOctave = 4): ParsedNote | null {
  const match = NOTE_RE.exec(input.trim())
  if (match === null) return null
  const letter = match[1]!.toUpperCase()
  const accText = match[2] ?? ''
  const octave = match[3] === undefined ? defaultOctave : Number(match[3])
  if (!Number.isInteger(octave)) return null
  const letterIndex = LETTERS.indexOf(letter as (typeof LETTERS)[number])
  const accidental = accidentalSemis(accText)
  const midi = (octave + 1) * 12 + DIATONIC_PC[letter]! + accidental
  if (midi < 0 || midi > 127) return null
  const pc = ((midi % 12) + 12) % 12
  return { letter, letterIndex, accidental, octave, midi, pc }
}

/** Render an accidental offset as its textual form. */
export function accidentalName(diff: number): string {
  switch (diff) {
    case 0: return ''
    case 1: return '#'
    case 2: return '##'
    case -1: return 'b'
    case -2: return 'bb'
    default: throw new Error(`unspellable accidental offset ${diff}`)
  }
}

/**
 * Normalize a pitch-class difference into [-6, 6], preferring the smaller
 * absolute value so single/double accidentals stay conventional.
 */
export function normalizeDiff(raw: number): number {
  let x = ((raw % 12) + 12) % 12
  if (x > 6) x -= 12
  return x
}

/**
 * Spell a target pitch class on a given letter: returns the accidental offset
 * that makes the letter sound at `targetPc` (in semitones, -2..+2 for the
 * tables used by this plugin; wider offsets throw).
 */
export function spellOnLetter(targetPc: number, letterIndex: number): number {
  const base = DIATONIC_PC[LETTERS[letterIndex]!]!
  const diff = normalizeDiff(targetPc - base)
  if (diff > 2 || diff < -2) throw new Error(`unspellable pitch class ${targetPc} on letter ${LETTERS[letterIndex]}`)
  return diff
}

/** MIDI note number -> frequency in Hz for the given A4 reference. */
export function midiToFrequency(midi: number, a4Hz: number): number {
  return a4Hz * 2 ** ((midi - MIDI_A4) / 12)
}

/** Frequency in Hz -> nearest MIDI note number (unrounded fractional value). */
export function frequencyToMidi(frequencyHz: number, a4Hz: number): number {
  return MIDI_A4 + 12 * Math.log2(frequencyHz / a4Hz)
}

/** Cents deviation between a real frequency and a MIDI note's equal-tempered pitch. */
export function centsDeviation(frequencyHz: number, midi: number, a4Hz: number): number {
  return 1200 * Math.log2(frequencyHz / midiToFrequency(midi, a4Hz))
}

/** Format a spelled pitch (letter + accidental + octave) from absolute semitone info. */
export function formatSpelling(letterIndex: number, accidental: number, midi: number): string {
  const semitone = DIATONIC_PC[LETTERS[letterIndex]!]! + accidental
  const register = (midi - semitone) / 12
  const octave = register - 1
  return `${LETTERS[letterIndex]}${accidentalName(accidental)}${octave}`
}

/** All conventional spellings (|offset| <= 1) of a MIDI pitch, natural spelling first. */
export function enharmonicsOf(midi: number): string[] {
  const pc = ((midi % 12) + 12) % 12
  const candidates: Array<{ name: string; diff: number }> = []
  for (let li = 0; li < 7; li += 1) {
    const base = DIATONIC_PC[LETTERS[li]!]!
    const diff = normalizeDiff(pc - base)
    if (Math.abs(diff) <= 1) candidates.push({ name: formatSpelling(li, diff, midi), diff })
  }
  candidates.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || b.diff - a.diff)
  return candidates.map((c) => c.name)
}

/** A chord quality definition: letter steps and semitone offsets from the root. */
export interface ChordDef {
  /** Letter-cycle offsets (root=0, third=2, ...). */
  letters: readonly number[]
  /** Semitone offsets from the root. */
  semis: readonly number[]
  /** Interval labels ("1", "b3", "5", "bb7", ...). */
  intervals: readonly string[]
}

export const CHORDS: Readonly<Record<string, ChordDef>> = Object.freeze({
  maj: { letters: [0, 2, 4], semis: [0, 4, 7], intervals: ['1', '3', '5'] },
  min: { letters: [0, 2, 4], semis: [0, 3, 7], intervals: ['1', 'b3', '5'] },
  dim: { letters: [0, 2, 4], semis: [0, 3, 6], intervals: ['1', 'b3', 'b5'] },
  aug: { letters: [0, 2, 4], semis: [0, 4, 8], intervals: ['1', '3', '#5'] },
  sus2: { letters: [0, 1, 4], semis: [0, 2, 7], intervals: ['1', '2', '5'] },
  sus4: { letters: [0, 3, 4], semis: [0, 5, 7], intervals: ['1', '4', '5'] },
  5: { letters: [0, 4], semis: [0, 7], intervals: ['1', '5'] },
  6: { letters: [0, 2, 4, 5], semis: [0, 4, 7, 9], intervals: ['1', '3', '5', '6'] },
  m6: { letters: [0, 2, 4, 5], semis: [0, 3, 7, 9], intervals: ['1', 'b3', '5', '6'] },
  7: { letters: [0, 2, 4, 6], semis: [0, 4, 7, 10], intervals: ['1', '3', '5', 'b7'] },
  maj7: { letters: [0, 2, 4, 6], semis: [0, 4, 7, 11], intervals: ['1', '3', '5', '7'] },
  m7: { letters: [0, 2, 4, 6], semis: [0, 3, 7, 10], intervals: ['1', 'b3', '5', 'b7'] },
  m7b5: { letters: [0, 2, 4, 6], semis: [0, 3, 6, 10], intervals: ['1', 'b3', 'b5', 'b7'] },
  dim7: { letters: [0, 2, 4, 6], semis: [0, 3, 6, 9], intervals: ['1', 'b3', 'b5', 'bb7'] },
  aug7: { letters: [0, 2, 4, 6], semis: [0, 4, 8, 10], intervals: ['1', '3', '#5', 'b7'] },
  '7sus4': { letters: [0, 3, 4, 6], semis: [0, 5, 7, 10], intervals: ['1', '4', '5', 'b7'] },
  add9: { letters: [0, 2, 4, 8], semis: [0, 4, 7, 14], intervals: ['1', '3', '5', '9'] },
  madd9: { letters: [0, 2, 4, 8], semis: [0, 3, 7, 14], intervals: ['1', 'b3', '5', '9'] },
  maj9: { letters: [0, 2, 4, 6, 8], semis: [0, 4, 7, 11, 14], intervals: ['1', '3', '5', '7', '9'] },
  9: { letters: [0, 2, 4, 6, 8], semis: [0, 4, 7, 10, 14], intervals: ['1', '3', '5', 'b7', '9'] },
  m9: { letters: [0, 2, 4, 6, 8], semis: [0, 3, 7, 10, 14], intervals: ['1', 'b3', '5', 'b7', '9'] },
  11: { letters: [0, 2, 4, 6, 10], semis: [0, 4, 7, 10, 17], intervals: ['1', '3', '5', 'b7', '11'] },
  m11: { letters: [0, 2, 4, 6, 10], semis: [0, 3, 7, 10, 17], intervals: ['1', 'b3', '5', 'b7', '11'] },
  13: { letters: [0, 2, 4, 6, 12], semis: [0, 4, 7, 10, 21], intervals: ['1', '3', '5', 'b7', '13'] },
  maj13: { letters: [0, 2, 4, 6, 12], semis: [0, 4, 7, 11, 21], intervals: ['1', '3', '5', '7', '13'] },
  '6/9': { letters: [0, 2, 4, 5, 8], semis: [0, 4, 7, 9, 14], intervals: ['1', '3', '5', '6', '9'] },
})

export const CHORD_QUALITIES: readonly string[] = Object.keys(CHORDS)

/** A scale definition: letter steps, semitone offsets and interval labels. */
export interface ScaleDef {
  letters: readonly number[]
  semis: readonly number[]
  intervals: readonly string[]
}

const SCALE_TABLE: Readonly<Record<string, ScaleDef>> = Object.freeze({
  major: {
    letters: [0, 1, 2, 3, 4, 5, 6],
    semis: [0, 2, 4, 5, 7, 9, 11],
    intervals: ['1', '2', '3', '4', '5', '6', '7'],
  },
  natural_minor: {
    letters: [0, 1, 2, 3, 4, 5, 6],
    semis: [0, 2, 3, 5, 7, 8, 10],
    intervals: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
  },
  harmonic_minor: {
    letters: [0, 1, 2, 3, 4, 5, 6],
    semis: [0, 2, 3, 5, 7, 8, 11],
    intervals: ['1', '2', 'b3', '4', '5', 'b6', '7'],
  },
  melodic_minor: {
    letters: [0, 1, 2, 3, 4, 5, 6],
    semis: [0, 2, 3, 5, 7, 9, 11],
    intervals: ['1', '2', 'b3', '4', '5', '6', '7'],
  },
  dorian: {
    letters: [0, 1, 2, 3, 4, 5, 6],
    semis: [0, 2, 3, 5, 7, 9, 10],
    intervals: ['1', '2', 'b3', '4', '5', '6', 'b7'],
  },
  phrygian: {
    letters: [0, 1, 2, 3, 4, 5, 6],
    semis: [0, 1, 3, 5, 7, 8, 10],
    intervals: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
  },
  lydian: {
    letters: [0, 1, 2, 3, 4, 5, 6],
    semis: [0, 2, 4, 6, 7, 9, 11],
    intervals: ['1', '2', '3', '#4', '5', '6', '7'],
  },
  mixolydian: {
    letters: [0, 1, 2, 3, 4, 5, 6],
    semis: [0, 2, 4, 5, 7, 9, 10],
    intervals: ['1', '2', '3', '4', '5', '6', 'b7'],
  },
  locrian: {
    letters: [0, 1, 2, 3, 4, 5, 6],
    semis: [0, 1, 3, 5, 6, 8, 10],
    intervals: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'],
  },
  major_pentatonic: {
    letters: [0, 1, 2, 4, 5],
    semis: [0, 2, 4, 7, 9],
    intervals: ['1', '2', '3', '5', '6'],
  },
  minor_pentatonic: {
    letters: [0, 2, 3, 4, 6],
    semis: [0, 3, 5, 7, 10],
    intervals: ['1', 'b3', '4', '5', 'b7'],
  },
  blues: {
    letters: [0, 2, 3, 4, 4, 6],
    semis: [0, 3, 5, 6, 7, 10],
    intervals: ['1', 'b3', '4', 'b5', '5', 'b7'],
  },
  whole_tone: {
    letters: [0, 1, 2, 3, 4, 5],
    semis: [0, 2, 4, 6, 8, 10],
    intervals: ['1', '2', '3', '#4', '#5', '#6'],
  },
  chromatic: {
    letters: [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6],
    semis: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    intervals: ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'],
  },
})

/** Canonical scale type list (schema enum) with friendly aliases. */
export const SCALE_TYPES: readonly string[] = [
  'major',
  'ionian',
  'natural_minor',
  'minor',
  'aeolian',
  'harmonic_minor',
  'melodic_minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'major_pentatonic',
  'minor_pentatonic',
  'blues',
  'whole_tone',
  'chromatic',
]

const SCALE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  ionian: 'major',
  minor: 'natural_minor',
  aeolian: 'natural_minor',
})

/** Resolve a scale type (including aliases) to its canonical definition name. */
export function resolveScaleType(type: string): string | null {
  const canonical = SCALE_ALIASES[type] ?? type
  return canonical in SCALE_TABLE ? canonical : null
}

/** A fully spelled note with MIDI number and frequency. */
export interface NoteData {
  name: string
  midi: number
  frequencyHz: number
}

function spellSequence(root: ParsedNote, def: { letters: readonly number[]; semis: readonly number[] }, a4Hz: number): NoteData[] {
  return def.semis.map((semi, i) => {
    const letterIndex = (root.letterIndex + def.letters[i]!) % 7
    const targetPc = (root.pc + semi) % 12
    const accidental = spellOnLetter(targetPc, letterIndex)
    const midi = root.midi + semi
    return {
      name: formatSpelling(letterIndex, accidental, midi),
      midi,
      frequencyHz: midiToFrequency(midi, a4Hz),
    }
  })
}

/** Build a chord on `root` with the given quality. Returns null for unknown quality. */
export function buildChord(root: ParsedNote, quality: string, a4Hz: number): { chordName: string; notes: NoteData[]; intervals: string[] } | null {
  const def = CHORDS[quality]
  if (def === undefined) return null
  const notes = spellSequence(root, def, a4Hz)
  const chordName = `${root.letter}${accidentalName(root.accidental)}${quality}`
  return { chordName, notes, intervals: [...def.intervals] }
}

/** Generate a scale on `root` of the given canonical type. Returns null for unknown type. */
export function generateScale(root: ParsedNote, type: string, a4Hz: number): { scaleName: string; notes: NoteData[]; degrees: number[]; intervals: string[] } | null {
  const canonical = resolveScaleType(type)
  if (canonical === null) return null
  const def = SCALE_TABLE[canonical]!
  const notes = spellSequence(root, def, a4Hz)
  const scaleName = `${root.letter}${accidentalName(root.accidental)} ${canonical.replaceAll('_', ' ')}`
  return { scaleName, notes, degrees: def.semis.map((_, i) => i + 1), intervals: [...def.intervals] }
}

/* ===================== interval engine (v0.2.0) ===================== */

/** A canonical interval definition: number (1=unison, 8=octave, ...) and semitone size. */
export interface IntervalDef {
  /** Interval number, e.g. 3 for a third, 9 for a compound ninth. */
  number: number
  /** Quality: perfect / major / minor / diminished / augmented. */
  quality: 'P' | 'M' | 'm' | 'd' | 'A'
  /** Semitone size (always ascending). */
  semis: number
}

/** Canonical interval table (name -> definition). */
export const INTERVALS: Readonly<Record<string, IntervalDef>> = Object.freeze({
  P1: { number: 1, quality: 'P', semis: 0 },
  A1: { number: 1, quality: 'A', semis: 1 },
  d2: { number: 2, quality: 'd', semis: 0 },
  m2: { number: 2, quality: 'm', semis: 1 },
  M2: { number: 2, quality: 'M', semis: 2 },
  A2: { number: 2, quality: 'A', semis: 3 },
  d3: { number: 3, quality: 'd', semis: 2 },
  m3: { number: 3, quality: 'm', semis: 3 },
  M3: { number: 3, quality: 'M', semis: 4 },
  A3: { number: 3, quality: 'A', semis: 5 },
  d4: { number: 4, quality: 'd', semis: 4 },
  P4: { number: 4, quality: 'P', semis: 5 },
  A4: { number: 4, quality: 'A', semis: 6 },
  d5: { number: 5, quality: 'd', semis: 6 },
  P5: { number: 5, quality: 'P', semis: 7 },
  A5: { number: 5, quality: 'A', semis: 8 },
  m6: { number: 6, quality: 'm', semis: 8 },
  M6: { number: 6, quality: 'M', semis: 9 },
  d7: { number: 7, quality: 'd', semis: 9 },
  m7: { number: 7, quality: 'm', semis: 10 },
  M7: { number: 7, quality: 'M', semis: 11 },
  P8: { number: 8, quality: 'P', semis: 12 },
  A8: { number: 8, quality: 'A', semis: 13 },
  m9: { number: 9, quality: 'm', semis: 13 },
  M9: { number: 9, quality: 'M', semis: 14 },
  m10: { number: 10, quality: 'm', semis: 15 },
  M10: { number: 10, quality: 'M', semis: 16 },
  P11: { number: 11, quality: 'P', semis: 17 },
  A11: { number: 11, quality: 'A', semis: 18 },
  d12: { number: 12, quality: 'd', semis: 18 },
  P12: { number: 12, quality: 'P', semis: 19 },
  m13: { number: 13, quality: 'm', semis: 20 },
  M13: { number: 13, quality: 'M', semis: 21 },
  P15: { number: 15, quality: 'P', semis: 24 },
})

/** Canonical interval names (schema enum). */
export const INTERVAL_NAMES: readonly string[] = Object.keys(INTERVALS)

/** Friendly aliases -> canonical interval names. */
export const INTERVAL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  unison: 'P1',
  octave: 'P8',
  tritone: 'A4',
  aug4: 'A4',
  dim5: 'd5',
  aug5: 'A5',
  dim7: 'd7',
  semitone: 'm2',
  half_step: 'm2',
  whole_step: 'M2',
  whole_tone: 'M2',
  augmented_octave: 'A8',
})

/** Alias keys (schema enum extension). */
export const INTERVAL_ALIAS_KEYS: readonly string[] = Object.keys(INTERVAL_ALIASES)

/** Resolve a user-supplied interval name (canonical or alias) to its canonical name. */
export function resolveIntervalName(name: string): string | null {
  const trimmed = name.trim()
  if (INTERVALS[trimmed] !== undefined) return trimmed
  return INTERVAL_ALIASES[trimmed] ?? null
}

/** Diatonic semitone size of a simple interval number (1-7). */
const DIATONIC_SEMIS: Readonly<Record<number, number>> = Object.freeze({
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
})

/**
 * Map a pitch deviation (semitones - diatonic semitones) to an interval
 * quality. Perfect families (1/4/5 and their compounds) use P/A/d;
 * imperfect families (2/3/6/7) use M/m/A/d. Wider deviations clamp to
 * AA/dd labels while the exact semitone count is always reported.
 */
export function intervalQuality(number: number, delta: number): string {
  const simple = ((number - 1) % 7) + 1
  const perfect = simple === 1 || simple === 4 || simple === 5
  if (perfect) {
    if (delta >= 2) return 'AA'
    if (delta === 1) return 'A'
    if (delta === 0) return 'P'
    if (delta === -1) return 'd'
    return 'dd'
  }
  if (delta >= 2) return 'AA'
  if (delta === 1) return 'A'
  if (delta === 0) return 'M'
  if (delta === -1) return 'm'
  if (delta === -2) return 'd'
  return 'dd'
}

/** A spelled target note produced by building an interval. */
export interface IntervalTarget {
  /** Spelled note name, e.g. "E4", "Ab3", "B#4". */
  name: string
  /** MIDI note number. */
  midi: number
  /** Canonical interval name as given. */
  interval: string
  /** Semitone distance (always positive; direction is separate). */
  semitones: number
  /** Travel direction from the root. */
  direction: 'ascending' | 'descending'
}

/**
 * Build the correctly spelled target note of `name` (canonical or alias)
 * from `root` in the given direction. Returns null for unknown intervals,
 * unspellable targets or results outside the MIDI range.
 */
export function buildIntervalTarget(root: ParsedNote, name: string, direction: 'ascending' | 'descending' = 'ascending'): IntervalTarget | null {
  const canonical = resolveIntervalName(name)
  if (canonical === null) return null
  const def = INTERVALS[canonical]!
  const descending = direction === 'descending'
  const letterSteps = (def.number - 1) % 7
  const li2 = descending ? (root.letterIndex - letterSteps + 7) % 7 : (root.letterIndex + letterSteps) % 7
  const pc2 = descending ? (((root.pc - def.semis) % 12) + 12) % 12 : (root.pc + def.semis) % 12
  const midi2 = descending ? root.midi - def.semis : root.midi + def.semis
  if (midi2 < 0 || midi2 > 127) return null
  let accidental: number
  try {
    accidental = spellOnLetter(pc2, li2)
  } catch {
    return null
  }
  return {
    name: formatSpelling(li2, accidental, midi2),
    midi: midi2,
    interval: canonical,
    semitones: def.semis,
    direction: descending ? 'descending' : 'ascending',
  }
}

/** Named interval between two notes. */
export interface IntervalAnalysis {
  /** Interval name, e.g. "M3", "d5", "M10", "P1". */
  name: string
  /** Absolute semitone distance. */
  semitones: number
  /** Travel direction from note1's perspective. */
  direction: 'ascending' | 'descending' | 'unison'
  /** Octave count embedded in the interval (0 for simple intervals). */
  octaves: number
  /** Octave-reduced simple form, e.g. "M3" for "M10". */
  simple: string
  /** True when the interval spans more than an octave. */
  compound: boolean
}

/**
 * Name the interval between two parsed notes. The letter distance between
 * the spellings decides the number (C->F# is an A4, C->Gb a d5), the
 * semitone distance decides the quality. Direction is reported separately.
 */
export function analyzeInterval(note1: ParsedNote, note2: ParsedNote): IntervalAnalysis {
  const d = note2.midi - note1.midi
  const ad = Math.abs(d)
  if (d === 0 && note1.letterIndex === note2.letterIndex) {
    return { name: 'P1', semitones: 0, direction: 'unison', octaves: 0, simple: 'P1', compound: false }
  }
  let loLetter: number
  let hiLetter: number
  let direction: 'ascending' | 'descending'
  if (d > 0) {
    loLetter = note1.letterIndex
    hiLetter = note2.letterIndex
    direction = 'ascending'
  } else if (d < 0) {
    loLetter = note2.letterIndex
    hiLetter = note1.letterIndex
    direction = 'descending'
  } else {
    // Equal pitch, different letters: use the (octave * 7 + letter) order.
    const key1 = note1.octave * 7 + note1.letterIndex
    const key2 = note2.octave * 7 + note2.letterIndex
    if (key1 < key2) {
      loLetter = note1.letterIndex
      hiLetter = note2.letterIndex
      direction = 'ascending'
    } else {
      loLetter = note2.letterIndex
      hiLetter = note1.letterIndex
      direction = 'descending'
    }
  }
  const letterSteps = (hiLetter - loLetter + 7) % 7
  const numberSimple = letterSteps + 1
  const diatonic = DIATONIC_SEMIS[numberSimple]!
  const k = Math.max(0, Math.round((ad - diatonic) / 12))
  const number = numberSimple + 7 * k
  const delta = ad - (diatonic + 12 * k)
  const quality = intervalQuality(number, delta)
  const simple = k === 0 ? `${quality}${number}` : `${intervalQuality(numberSimple, delta)}${numberSimple}`
  return {
    name: `${quality}${number}`,
    semitones: ad,
    direction,
    octaves: k,
    simple,
    compound: k > 0,
  }
}

/* ===================== scale harmonization (v0.2.0) ===================== */

/** A spelled scale note carrying the spelling engine's letter + accidental. */
export interface SpelledScaleNote {
  name: string
  midi: number
  letterIndex: number
  accidental: number
}

/** Spell the notes of a canonical scale on `root` (letters + accidentals resolved). */
export function spellScaleNotes(root: ParsedNote, canonicalType: string): SpelledScaleNote[] | null {
  const canonical = resolveScaleType(canonicalType)
  if (canonical === null) return null
  const def = SCALE_TABLE[canonical]
  if (def === undefined) return null
  return def.semis.map((semi, i) => {
    const letterIndex = (root.letterIndex + def.letters[i]!) % 7
    const targetPc = (root.pc + semi) % 12
    const accidental = spellOnLetter(targetPc, letterIndex)
    const midi = root.midi + semi
    return { name: formatSpelling(letterIndex, accidental, midi), midi, letterIndex, accidental }
  })
}

/** Scale types that can be harmonized (heptatonic: triads/sevenths stack cleanly). */
export const HARMONIZABLE_SCALES: readonly string[] = Object.keys(SCALE_TABLE).filter((key) => SCALE_TABLE[key]!.letters.length === 7)

/** One harmonized chord of a scale. */
export interface HarmonyChord {
  /** Scale degree, 1-7. */
  degree: number
  /** Roman numeral with quality suffix, e.g. "I", "ii", "vii°", "V7", "iiø7". */
  roman: string
  /** Triad/seventh quality in plain English. */
  quality: string
  /** Spelled note names. */
  notes: string[]
  /** MIDI note numbers. */
  midis: number[]
}

function triadQuality(s1: number, s2: number): string {
  if (s1 === 4 && s2 === 7) return 'major'
  if (s1 === 3 && s2 === 7) return 'minor'
  if (s1 === 3 && s2 === 6) return 'diminished'
  if (s1 === 4 && s2 === 8) return 'augmented'
  return 'other'
}

function seventhQuality(s: [number, number, number]): string {
  const [a, b, c] = s
  if (a === 4 && b === 7 && c === 11) return 'major7'
  if (a === 3 && b === 7 && c === 10) return 'minor7'
  if (a === 4 && b === 7 && c === 10) return 'dominant7'
  if (a === 3 && b === 6 && c === 10) return 'halfDiminished7'
  if (a === 3 && b === 6 && c === 9) return 'diminished7'
  if (a === 4 && b === 8 && c === 10) return 'augmented7'
  if (a === 3 && b === 7 && c === 11) return 'minorMajor7'
  return 'other'
}

const ROMAN: readonly string[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/** Roman numeral for a scale degree with its quality. */
export function romanFor(degree: number, quality: string, sevenths: boolean): string {
  const base = ROMAN[degree] ?? '?'
  if (sevenths) {
    switch (quality) {
      case 'major7': return `${base}maj7`
      case 'minor7': return `${base.toLowerCase()}7`
      case 'dominant7': return `${base}7`
      case 'halfDiminished7': return `${base.toLowerCase()}ø7`
      case 'diminished7': return `${base.toLowerCase()}°7`
      case 'augmented7': return `${base}+7`
      case 'minorMajor7': return `${base.toLowerCase()}(maj7)`
      default: return `${base.toLowerCase()}?7`
    }
  }
  switch (quality) {
    case 'major': return base
    case 'minor': return base.toLowerCase()
    case 'diminished': return `${base.toLowerCase()}°`
    case 'augmented': return `${base}+`
    default: return `${base.toLowerCase()}?`
  }
}

/**
 * Harmonize a heptatonic scale: stack thirds (or sevenths) on every scale
 * degree with correct spelling (G# major V = D# F## A#, harmonic minor
 * III is augmented). Returns null for non-heptatonic or unknown types.
 */
export function harmonizeScale(root: ParsedNote, canonicalType: string, sevenths = false): { progression: string; harmony: HarmonyChord[] } | null {
  const scale = spellScaleNotes(root, canonicalType)
  if (scale === null || scale.length !== 7) return null
  const count = sevenths ? 4 : 3
  const harmony: HarmonyChord[] = []
  for (let degree = 0; degree < 7; degree += 1) {
    const midis: number[] = []
    const notes: string[] = []
    for (let j = 0; j < count; j += 1) {
      const p = (degree + 2 * j) % 7
      const bump = Math.floor((degree + 2 * j) / 7)
      const note = scale[p]!
      const midi = note.midi + 12 * bump
      midis.push(midi)
      notes.push(formatSpelling(note.letterIndex, note.accidental, midi))
    }
    const s1 = (((midis[1]! - midis[0]!) % 12) + 12) % 12
    const s2 = (((midis[2]! - midis[0]!) % 12) + 12) % 12
    let quality: string
    if (sevenths) {
      const s3 = (((midis[3]! - midis[0]!) % 12) + 12) % 12
      quality = seventhQuality([s1, s2, s3])
    } else {
      quality = triadQuality(s1, s2)
    }
    harmony.push({
      degree: degree + 1,
      roman: romanFor(degree, quality, sevenths),
      quality,
      notes,
      midis,
    })
  }
  return { progression: harmony.map((h) => h.roman).join(' '), harmony }
}

/* ===================== chord identification (v0.3.0) ===================== */

/** Canonical spelling of a parsed note (letter + accidental + octave). */
export function noteName(note: ParsedNote): string {
  return formatSpelling(note.letterIndex, note.accidental, note.midi)
}

/** Pitch class of a semitone offset, normalized to 0-11. */
function pitchClassOf(semi: number): number {
  return ((semi % 12) + 12) % 12
}

/** Pitch-class set of one chord quality (mod 12, ascending, deduplicated). */
export function chordPitchClasses(quality: string): number[] | null {
  const def = CHORDS[quality]
  if (def === undefined) return null
  return [...new Set(def.semis.map(pitchClassOf))].sort((a, b) => a - b)
}

/**
 * Chord qualities indexed by their sorted pitch-class set (table order kept),
 * e.g. "0,2,4,7,9" -> ["6/9"]. Harmonic qualities that differ only by octave
 * placement (add9 vs. 6/9) share one entry — the ranking then decides.
 */
export const CHORD_PC_INDEX: Readonly<Record<string, readonly string[]>> = (() => {
  const index: Record<string, string[]> = {}
  for (const quality of CHORD_QUALITIES) {
    const key = chordPitchClasses(quality)!.join(',')
    const bucket = index[key] ?? (index[key] = [])
    bucket.push(quality)
  }
  return Object.freeze(index)
})()

/**
 * How common a chord quality is — the tie-breaker of the identification
 * ranking (lower = more common). Unknown qualities fall back to 4.
 */
export const QUALITY_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  maj: 0, min: 0, dim: 0, maj7: 0, m7: 0, 7: 0,
  m7b5: 1, dim7: 1, sus2: 1, sus4: 1,
  6: 2, m6: 2, 5: 2,
  aug: 3, aug7: 3, '7sus4': 3, add9: 3, madd9: 3,
  maj9: 4, 9: 4, m9: 4, 11: 4, m11: 4, 13: 4, maj13: 4, '6/9': 4,
})

/** One chord reading of a set of played notes. */
export interface ChordCandidate {
  /** Root spelled as written in the input (e.g. "B#", "Gb"). */
  root: string
  /** Chord quality key (one of `CHORD_QUALITIES`). */
  quality: string
  /** Root + quality, e.g. "C#maj". */
  symbol: string
  /** Interval labels of the chord (e.g. ["1","3","b7"]). */
  intervals: string[]
  /** Which chord tone is in the bass (0 = root position). */
  inversion: number
  /** Bass note spelled as written in the input. */
  bass: string
  /** Slash notation, e.g. "Cmaj/E" (equals `symbol` in root position). */
  slashSymbol: string
  /** True when the bass is the root. */
  rootPosition: boolean
  /** True for a complete match; false when chord tones are simply not played. */
  exact: boolean
  /** Interval labels of chord tones that are not played (absent when `exact`). */
  missing?: string[]
  /** Ranking score: `2 * inversion + quality weight + 3 * missing tones` (lower is better). */
  score: number
}

/** Result of identifying the chord(s) behind a set of notes. */
export interface ChordIdentification {
  /** Bass note spelled as written in the input. */
  bass: string
  /** `exact` when the pitch classes equal a chord's; `incomplete` for reduced voicings. */
  mode: 'exact' | 'incomplete'
  /** Candidates, best first (see the ranking rule on `score`). */
  candidates: ChordCandidate[]
  /** Number of candidates found before the result cap. */
  total: number
}

/** Ranked candidate with the internal sort keys kept out of the public shape. */
interface RankedCandidate {
  candidate: ChordCandidate
  rootPc: number
  tableIndex: number
}

/**
 * Identify the chord(s) behind a set of played notes.
 *
 * Pass 1 (mode `exact`) matches the whole pitch-class set against the chord
 * table, so every conventional quality is found — the classic C-E-G-A
 * ambiguity comes back as both C6 and Am7. Pass 2 (mode `incomplete`, only
 * when pass 1 finds nothing and at least three distinct pitch classes are
 * played) accepts voicings that simply omit one or two chord tones (C-E-Bb-D
 * is a C9 without the fifth); the root must be played, so rootless voicings
 * are not guessed at.
 *
 * Ranking: `2 * inversion + quality weight + 3 * missing tones`, then
 * root position first, then table order, then root pitch class, then
 * inversion. Returns null when fewer than two distinct pitch classes are
 * played (nothing can be identified from one pitch).
 */
export function identifyChord(notes: ParsedNote[], limit = 12): ChordIdentification | null {
  const written = new Map<number, string>()
  for (const note of notes) {
    if (!written.has(note.pc)) written.set(note.pc, `${note.letter}${accidentalName(note.accidental)}`)
  }
  const pcs = [...written.keys()].sort((a, b) => a - b)
  if (pcs.length < 2) return null
  const lowest = notes.reduce((a, b) => (b.midi < a.midi ? b : a))
  const bassPc = lowest.pc
  const bass = written.get(bassPc)!

  const make = (rootPc: number, quality: string, missing: string[]): RankedCandidate => {
    const def = CHORDS[quality]!
    const seq = chordPitchClasses(quality)!
    const rel = pitchClassOf(bassPc - rootPc)
    const index = seq.indexOf(rel)
    const inversion = index < 0 ? 0 : index
    const root = written.get(rootPc)!
    const symbol = `${root}${quality}`
    const exact = missing.length === 0
    const candidate: ChordCandidate = {
      root,
      quality,
      symbol,
      intervals: [...def.intervals],
      inversion,
      bass,
      slashSymbol: inversion === 0 ? symbol : `${symbol}/${bass}`,
      rootPosition: inversion === 0,
      exact,
      score: 2 * inversion + (QUALITY_WEIGHTS[quality] ?? 4) + 3 * missing.length,
    }
    if (!exact) candidate.missing = [...missing]
    return { candidate, rootPc, tableIndex: CHORD_QUALITIES.indexOf(quality) }
  }

  const found: RankedCandidate[] = []
  for (const rootPc of pcs) {
    const key = pcs.map((pc) => pitchClassOf(pc - rootPc)).sort((a, b) => a - b).join(',')
    for (const quality of CHORD_PC_INDEX[key] ?? []) found.push(make(rootPc, quality, []))
  }
  let mode: 'exact' | 'incomplete' = 'exact'
  if (found.length === 0 && pcs.length >= 3) {
    mode = 'incomplete'
    for (const rootPc of pcs) {
      const rel = new Set(pcs.map((pc) => pitchClassOf(pc - rootPc)))
      for (const quality of CHORD_QUALITIES) {
        const tones = new Set(chordPitchClasses(quality)!)
        let extra = false
        for (const pc of rel) {
          if (!tones.has(pc)) {
            extra = true
            break
          }
        }
        if (extra) continue // every played pitch class must be a chord tone
        const def = CHORDS[quality]!
        const missing: string[] = []
        def.intervals.forEach((label, i) => {
          if (!rel.has(pitchClassOf(def.semis[i]!))) missing.push(label)
        })
        if (missing.length >= 1 && missing.length <= 2) found.push(make(rootPc, quality, missing))
      }
    }
  }
  found.sort((a, b) => a.candidate.score - b.candidate.score
    || Number(b.candidate.rootPosition) - Number(a.candidate.rootPosition)
    || a.tableIndex - b.tableIndex
    || a.rootPc - b.rootPc
    || a.candidate.inversion - b.candidate.inversion)
  return { bass, mode, candidates: found.slice(0, Math.max(1, limit)).map((r) => r.candidate), total: found.length }
}

/* ===================== scale identification (v0.4.0) ===================== */

/** One scale reading of a set of played notes. */
export interface ScaleCandidate {
  /** Root spelled without octave, e.g. "F#", "Bb". */
  root: string
  /** Canonical scale type (`major`, `dorian`, `blues`, …). */
  type: string
  /** Root + readable type, e.g. "F# major", "A minor pentatonic". */
  name: string
  /** Spelled scale degrees without octave, root first. */
  notes: string[]
  /** Scale degrees that are not played (empty when `exact`). */
  missing: string[]
  /** True when the played pitch classes are exactly this scale's. */
  exact: boolean
  /** How many accidentals the spelled scale needs (spelling cost). */
  accidentalCount: number
  /** Ranking score: `3 * missing.length + accidentalCount` (lower is better). */
  score: number
}

/** Result of fitting scales to a set of played notes. */
export interface ScaleIdentification {
  mode: 'exact' | 'contains'
  candidates: ScaleCandidate[]
  total: number
}

/**
 * How common a scale type is — the ranking tie-breaker after spelling cost
 * (lower = more common). Unknown keys fall back to 4.
 */
export const SCALE_TYPE_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  major: 0, natural_minor: 0,
  dorian: 1, phrygian: 1, lydian: 1, mixolydian: 1, locrian: 1,
  harmonic_minor: 1, melodic_minor: 1,
  major_pentatonic: 1, minor_pentatonic: 1, blues: 1,
  whole_tone: 2, chromatic: 4,
})

const SCALE_TABLE_KEYS: readonly string[] = Object.keys(SCALE_TABLE)

/** Strip the octave label from a spelled note name ("C#4" -> "C#"). */
export function stripOctave(name: string): string {
  return name.replace(/-?\d+$/, '')
}

/** Every spelling of a pitch class whose accidental stays within a double accidental. */
function rootSpellings(pc: number): Array<{ letterIndex: number; accidental: number }> {
  const out: Array<{ letterIndex: number; accidental: number }> = []
  for (let letterIndex = 0; letterIndex < 7; letterIndex += 1) {
    const diff = normalizeDiff(pc - DIATONIC_PC[LETTERS[letterIndex]!]!)
    if (Math.abs(diff) > 2) continue
    out.push({ letterIndex, accidental: diff })
  }
  return out
}

/** Ranked candidate with the internal sort keys kept out of the public shape. */
interface RankedScale {
  candidate: ScaleCandidate
  rootPc: number
  tableIndex: number
  missingCount: number
  spellingMismatch: number
  rootIsLowest: boolean
}

/**
 * Fit the scale table to a set of played notes.
 *
 * Pass 1 (`mode: 'exact'`) keeps every scale whose pitch-class set is exactly
 * the played set — the classic ambiguity comes back in full: the notes of
 * C major are also D dorian, E phrygian, …, and a five-note set is both
 * C major pentatonic and A minor pentatonic. Pass 2 (`mode: 'contains'`, only
 * when pass 1 finds nothing and at least three distinct pitch classes are
 * played) keeps scales that contain every played note and reports the degrees
 * that are missing, so a melody fragment still resolves.
 *
 * Spelling is reported, never guessed by "nearest key": every root spelling
 * within a double accidental is tried and the reading that agrees with how the
 * notes were written wins ties (C#-D#-E#-F#-G#-A#-B# comes back as C# major,
 * not as the enharmonic Db major). Scales that would need a triple accidental
 * or more than seven accidentals in total are not reported at all.
 *
 * Ranking: fewest missing degrees, then best spelling agreement with the
 * input, then the most common scale type, then whether the scale's tonic is
 * the lowest note played (the bass usually names the key), then fewest
 * accidentals, then root pitch class, then table order. Relative keys share a
 * pitch-class set, so both readings come back (major and its relative minor);
 * the order between them is cosmetic. Returns null for fewer than three
 * distinct pitch classes (too little information to name a scale).
 */
export function identifyScale(notes: ParsedNote[], limit = 12): ScaleIdentification | null {
  const written = new Map<number, string>()
  for (const note of notes) {
    if (!written.has(note.pc)) written.set(note.pc, `${note.letter}${accidentalName(note.accidental)}`)
  }
  const played = [...written.keys()].sort((a, b) => a - b)
  if (played.length < 3) return null
  const playedSet = new Set(played)
  const lowestPc = notes.reduce((a, b) => (b.midi < a.midi ? b : a)).pc

  const collect = (exactOnly: boolean): RankedScale[] => {
    const found: RankedScale[] = []
    for (let tableIndex = 0; tableIndex < SCALE_TABLE_KEYS.length; tableIndex += 1) {
      const type = SCALE_TABLE_KEYS[tableIndex]!
      const def = SCALE_TABLE[type]!
      for (const pc of played) {
        for (const root of rootSpellings(pc)) {
          const parsed: ParsedNote = {
            letter: LETTERS[root.letterIndex]!,
            letterIndex: root.letterIndex,
            accidental: root.accidental,
            octave: 4,
            midi: 60 + pc,
            pc,
          }
          let scale: SpelledScaleNote[] | null = null
          try {
            scale = spellScaleNotes(parsed, type)
          } catch {
            scale = null
          }
          if (scale === null) continue
          if (scale.some((n) => Math.abs(n.accidental) > 2)) continue
          const degreePcs = def.semis.map((semi) => ((pc + semi) % 12 + 12) % 12)
          const degreeSet = new Set(degreePcs)
          const hasExtra = played.some((p) => !degreeSet.has(p))
          const missingCount = degreePcs.filter((p) => !playedSet.has(p)).length
          if (exactOnly) {
            if (hasExtra || missingCount > 0) continue
          } else {
            if (hasExtra) continue
            if (missingCount === 0) continue // exact matches belong to pass 1
          }
          const accidentalCount = scale.reduce((sum, n) => sum + Math.abs(n.accidental), 0)
          if (accidentalCount > 7) continue
          const names = scale.map((n) => stripOctave(n.name))
          let spellingMismatch = 0
          names.forEach((name, i) => {
            const asWritten = written.get(degreePcs[i]!)
            if (asWritten !== undefined && asWritten !== name) spellingMismatch += 1
          })
          const rootName = names[0]!
          const candidate: ScaleCandidate = {
            root: rootName,
            type,
            name: `${rootName} ${type.replace(/_/g, ' ')}`,
            notes: names,
            missing: scale.filter((_n, i) => !playedSet.has(degreePcs[i]!)).map((n) => stripOctave(n.name)),
            exact: missingCount === 0,
            accidentalCount,
            score: 3 * missingCount + accidentalCount,
          }
          if (candidate.exact && candidate.missing.length !== 0) continue
          found.push({ candidate, rootPc: pc, tableIndex, missingCount, spellingMismatch, rootIsLowest: pc === lowestPc })
        }
      }
    }
    return found
  }

  let ranked = collect(true)
  let mode: 'exact' | 'contains' = 'exact'
  if (ranked.length === 0) {
    mode = 'contains'
    ranked = collect(false)
  }
  // One reading per (type, root pitch class): keep the spelling that agrees best.
  const bestPerRoot = new Map<string, RankedScale>()
  for (const entry of ranked) {
    const key = `${entry.candidate.type}@${entry.rootPc}`
    const existing = bestPerRoot.get(key)
    if (existing === undefined
      || entry.spellingMismatch < existing.spellingMismatch
      || (entry.spellingMismatch === existing.spellingMismatch && entry.candidate.accidentalCount < existing.candidate.accidentalCount)) {
      bestPerRoot.set(key, entry)
    }
  }
  const unique = [...bestPerRoot.values()]
  unique.sort((a, b) => a.missingCount - b.missingCount
    || a.spellingMismatch - b.spellingMismatch
    || (SCALE_TYPE_WEIGHTS[a.candidate.type] ?? 4) - (SCALE_TYPE_WEIGHTS[b.candidate.type] ?? 4)
    || Number(b.rootIsLowest) - Number(a.rootIsLowest)
    || a.candidate.accidentalCount - b.candidate.accidentalCount
    || a.rootPc - b.rootPc
    || a.tableIndex - b.tableIndex)
  return { mode, candidates: unique.slice(0, Math.max(1, limit)).map((r) => r.candidate), total: unique.length }
}

/* ===================== key signatures (v0.5.0) ===================== */

/** Key mode handled by the key-signature engine. */
export type KeyMode = 'major' | 'minor'

/** Order in which sharps appear in a key signature (F C G D A E B). */
const SHARP_ORDER: readonly string[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
/** Order in which flats appear in a key signature (B E A D G C F). */
const FLAT_ORDER: readonly string[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

/** Semitone offsets of a major scale from its tonic. */
const MAJOR_SEMIS: readonly number[] = [0, 2, 4, 5, 7, 9, 11]
/** Semitone offsets of a natural minor scale from its tonic. */
const MINOR_SEMIS: readonly number[] = [0, 2, 3, 5, 7, 8, 10]

/**
 * Widest key signature this module will spell: 11 sharps/flats (the seventh
 * accidental doubles). Anything wider would need a triple accidental, which
 * no conventional notation uses.
 */
export const MAX_FIFTHS = 11

/** A fully resolved key signature. */
export interface KeySignature {
  /** Readable key name, e.g. "Eb major", "C# minor". */
  key: string
  /** Tonic without octave, e.g. "Eb". */
  tonic: string
  mode: KeyMode
  /** Signed position on the circle of fifths (positive = sharps). */
  fifths: number
  /** The accidentals in signature order, e.g. ["Bb","Eb","Ab"]. */
  accidentals: string[]
  /** How many accidentals the signature carries (always >= 0). */
  accidentalCount: number
  /** Human summary of the signature, e.g. "3 flats" / "no accidentals". */
  signature: string
  /** Relative key (same signature, other mode), e.g. "C minor". */
  relative: string
  /** Parallel key (same tonic, other mode), e.g. "Eb minor". */
  parallel: string
  /** Enharmonic key inside the seven-accidental range; absent when there is none. */
  enharmonic?: string
  /** True when the signature stays within the usual seven sharps/flats. */
  practical: boolean
  /** Spelled scale notes of the key, tonic first, without octaves. */
  notes: string[]
}

/** Letter index of the tonic of the key at `fifths` (0 = C … 6 = B). */
function tonicLetterForFifths(fifths: number, mode: KeyMode): number {
  const steps = mode === 'major' ? 4 * fifths : 4 * fifths - 2
  return ((steps % 7) + 7) % 7
}

/** Pitch class of the tonic of the key at `fifths`. */
function tonicPcForFifths(fifths: number, mode: KeyMode): number {
  const raw = mode === 'major' ? 7 * fifths : 7 * fifths - 3
  return ((raw % 12) + 12) % 12
}

function spelledTonic(fifths: number, mode: KeyMode): string {
  const letterIndex = tonicLetterForFifths(fifths, mode)
  const pc = tonicPcForFifths(fifths, mode)
  const accidental = normalizeDiff(pc - DIATONIC_PC[LETTERS[letterIndex]!]!)
  return `${LETTERS[letterIndex]}${accidentalName(accidental)}`
}

function signatureText(accidentalCount: number, sharp: boolean): string {
  if (accidentalCount === 0) return 'no accidentals'
  return sharp ? `${accidentalCount} sharp${accidentalCount === 1 ? '' : 's'}` : `${accidentalCount} flat${accidentalCount === 1 ? '' : 's'}`
}

/** The accidentals of a signature in the order they are written. */
function signatureAccidentals(fifths: number): string[] {
  const count = Math.abs(fifths)
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER
  const out: string[] = []
  for (let i = 0; i < count; i += 1) {
    const letter = order[i % 7]!
    const doubled = i >= 7
    out.push(`${letter}${accidentalName(fifths > 0 ? (doubled ? 2 : 1) : (doubled ? -2 : -1))}`)
  }
  return out
}

/** Spelled notes of the key's scale (natural minor for minor keys), tonic first. */
function keyScaleNotes(fifths: number, mode: KeyMode): string[] {
  const letterIndex = tonicLetterForFifths(fifths, mode)
  const pc = tonicPcForFifths(fifths, mode)
  const semis = mode === 'major' ? MAJOR_SEMIS : MINOR_SEMIS
  return semis.map((semi, i) => {
    const li = (letterIndex + i) % 7
    const target = (pc + semi) % 12
    return `${LETTERS[li]}${accidentalName(spellOnLetter(target, li))}`
  })
}

/**
 * Resolve a signed circle-of-fifths position into a key signature.
 *
 * `fifths = 0` is C major / A minor, positive values are sharp keys
 * (1 = G major, 7 = C# major), negative values flat keys (-1 = F major,
 * -7 = Cb major). Signatures beyond seven accidentals still resolve (they
 * need double sharps or double flats) but are flagged `practical: false`.
 * Returns null when |fifths| > 11 (that would need a triple accidental).
 */
export function keySignature(fifths: number, mode: KeyMode = 'major'): KeySignature | null {
  if (!Number.isInteger(fifths) || Math.abs(fifths) > MAX_FIFTHS) return null
  const tonic = spelledTonic(fifths, mode)
  const accidentalCount = Math.abs(fifths)
  const signature: KeySignature = {
    key: `${tonic} ${mode}`,
    tonic,
    mode,
    fifths,
    accidentals: signatureAccidentals(fifths),
    accidentalCount,
    signature: signatureText(accidentalCount, fifths > 0),
    relative: `${spelledTonic(fifths, mode === 'major' ? 'minor' : 'major')} ${mode === 'major' ? 'minor' : 'major'}`,
    parallel: `${spelledTonic(fifths + (mode === 'major' ? -3 : 3), mode === 'major' ? 'minor' : 'major')} ${mode === 'major' ? 'minor' : 'major'}`,
    practical: accidentalCount <= 7,
    notes: keyScaleNotes(fifths, mode),
  }
  if (fifths !== 0) {
    const flipped = fifths > 0 ? fifths - 12 : fifths + 12
    if (Math.abs(flipped) <= 7) signature.enharmonic = `${spelledTonic(flipped, mode)} ${mode}`
  }
  return signature
}

/**
 * Resolve the circle-of-fifths position of a written tonic, e.g. "Eb" → -3,
 * "F#" → 6, "Cb" → -7, "A" as a minor tonic → 0. Returns null when the
 * spelling is not a key this module can spell.
 */
export function fifthsOfTonic(letterIndex: number, accidental: number, mode: KeyMode): number | null {
  if (Math.abs(accidental) > 2) return null
  const pc = (((DIATONIC_PC[LETTERS[letterIndex]!]! + accidental) % 12) + 12) % 12
  for (let fifths = -MAX_FIFTHS; fifths <= MAX_FIFTHS; fifths += 1) {
    if (tonicLetterForFifths(fifths, mode) === letterIndex && tonicPcForFifths(fifths, mode) === pc) return fifths
  }
  return null
}

/** Parse a key spec like "Eb", "F# minor", "Bb major", "c#min". */
export function parseKeySpec(spec: string, modeOverride?: KeyMode): { signature: KeySignature; modeAssumed: boolean } | null {
  const match = /^([A-Ga-g])(#{1,2}|x|b{1,2})?\s*(.*)$/.exec(spec.trim())
  if (match === null) return null
  const letter = match[1]!.toUpperCase()
  const letterIndex = LETTERS.indexOf(letter as (typeof LETTERS)[number])
  const accidental = accidentalSemis(match[2] ?? '')
  const rest = match[3]!.trim().toLowerCase()
  let mode: KeyMode
  let modeAssumed = false
  if (rest === '' || rest === 'key') {
    mode = modeOverride ?? 'major'
    modeAssumed = modeOverride === undefined
  } else if (rest === 'major' || rest === 'maj') {
    mode = 'major'
  } else if (rest === 'minor' || rest === 'min' || rest === 'm') {
    mode = 'minor'
  } else {
    return null
  }
  const fifths = fifthsOfTonic(letterIndex, accidental, mode)
  if (fifths === null) return null
  const signature = keySignature(fifths, mode)
  if (signature === null) return null
  return { signature, modeAssumed }
}

/* ===================== roman numeral analysis (v0.5.0) ===================== */

/** A chord symbol parsed into root, quality and optional slash bass. */
export interface ParsedChordSymbol {
  /** The symbol as written, trimmed. */
  symbol: string
  root: ParsedNote
  /** Canonical quality key from the chord table. */
  quality: string
  /** Slash bass when the symbol names one. */
  bass?: ParsedNote
}

/** Quality aliases accepted on top of the canonical chord-table keys. */
const CHORD_QUALITY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  '': 'maj',
  maj: 'maj',
  M: 'maj',
  major: 'maj',
  m: 'min',
  min: 'min',
  minor: 'min',
  '-': 'min',
  dim: 'dim',
  '°': 'dim',
  o: 'dim',
  aug: 'aug',
  '+': 'aug',
  M7: 'maj7',
  'Δ7': 'maj7',
  major7: 'maj7',
  min7: 'm7',
  '-7': 'm7',
  min9: 'm9',
  '-9': 'm9',
  min11: 'm11',
  '-11': 'm11',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  min7b5: 'm7b5',
  '°7': 'dim7',
  o7: 'dim7',
  min6: 'm6',
  '-6': 'm6',
  major6: '6',
  major9: 'maj9',
  major13: 'maj13',
  dom7: '7',
})

/** Map a written chord suffix to a canonical chord-table quality. */
export function resolveChordQuality(text: string): string | null {
  if (text in CHORDS) return text
  return CHORD_QUALITY_ALIASES[text] ?? null
}

/**
 * Parse a chord symbol like "C", "Am", "F#m7b5", "Bb7", "C/E", "D6/9".
 * Returns null when the root, the slash bass or the quality is not
 * recognized — no quality is ever guessed from a partial match.
 */
export function parseChordSymbol(symbol: string): ParsedChordSymbol | null {
  const trimmed = symbol.trim()
  const match = /^([A-Ga-g])(#{1,2}|x|b{1,2})?/.exec(trimmed)
  if (match === null) return null
  const rootText = `${match[1]!}${match[2] ?? ''}`
  const root = parseNote(rootText)
  if (root === null) return null
  let rest = trimmed.slice(match[0].length)
  let bass: ParsedNote | undefined
  const slash = rest.lastIndexOf('/')
  if (slash >= 0) {
    const candidate = rest.slice(slash + 1)
    const parsedBass = parseNote(candidate)
    if (parsedBass !== null) {
      bass = parsedBass
      rest = rest.slice(0, slash)
    }
  }
  const quality = resolveChordQuality(rest)
  if (quality === null) return null
  const parsed: ParsedChordSymbol = { symbol: trimmed, root, quality }
  if (bass !== undefined) parsed.bass = bass
  return parsed
}

/** One analyzed chord of a progression. */
export interface RomanChord {
  /** The symbol as written, e.g. "Am7". */
  symbol: string
  /** Spelled root, e.g. "A". */
  root: string
  /** Canonical quality key, e.g. "m7". */
  quality: string
  /** Scale degree 1-7 the root is written on. */
  degree: number
  /** Semitones the written root sits above that degree (-2 … +2). */
  accidental: number
  /** Roman numeral with quality and figured bass, e.g. "vi7", "bVII", "I6". */
  roman: string
  /** True when every chord tone belongs to the key's scale. */
  inKey: boolean
  /** True when the chord equals the key's own chord of the same size on that degree. */
  diatonic: boolean
  /** Roman numeral of the key's own triad on that degree, e.g. "vii°". */
  keyTriad: string
  /** Spelled chord tones, root first (no octaves). */
  notes: string[]
  /** Slash bass as written. */
  bass?: string
  /** Inversion index when the bass is a chord tone (0 = root position). */
  inversion?: number
  /** False when the slash bass is not a chord tone (e.g. C/D). */
  bassInChord?: boolean
}

/** Result of analyzing a chord progression in a key. */
export interface RomanAnalysis {
  /** Readable key name, e.g. "C major". */
  key: string
  mode: KeyMode
  fifths: number
  /** Roman numerals of the whole progression, e.g. "vi IV I V". */
  progression: string
  chords: RomanChord[]
  /** How many chords are diatonic to the key. */
  diatonicCount: number
}

/** Roman numeral of a key's diatonic chord on a degree. */
function keyChordRoman(scalePcs: readonly number[], degree: number): string {
  const root = scalePcs[degree]!
  const rel = (semi: number): number => (((scalePcs[semi]! - root) % 12) + 12) % 12
  const quality = triadQuality(rel((degree + 2) % 7), rel((degree + 4) % 7))
  return romanFor(degree, quality, false)
}

/**
 * Analyze a progression of chord symbols in a key.
 *
 * The scale degree is decided by the written letter, not by the pitch class:
 * in C major, `A#` is `#vi` and `Bb` is `bVII` (same key on the piano, two
 * different functions on paper). Chord qualities come from the same table as
 * `chord_build`, so `diatonic` can be checked against the key's own chord of
 * the same size, and slash basses get figured-bass labels (`C/E` → `I6`,
 * `G7/F` → `V42`). Chords whose tones leave the key are reported with
 * `inKey: false` instead of being forced into a degree.
 */
export function analyzeProgression(
  spec: string,
  symbols: string[],
  modeOverride?: KeyMode,
): { ok: true; value: RomanAnalysis } | { ok: false; error: string } {
  if (symbols.length === 0) return { ok: false, error: 'give at least one chord symbol (e.g. ["Am","F","C","G"])' }
  if (symbols.length > 16) return { ok: false, error: `at most 16 chords per progression (got ${symbols.length})` }
  const parsedKey = parseKeySpec(spec, modeOverride)
  if (parsedKey === null) {
    return { ok: false, error: `unrecognized key "${spec}" (expect e.g. "C major", "Eb", "F# minor")` }
  }
  const signature = parsedKey.signature
  const tonicLetter = tonicLetterForFifths(signature.fifths, signature.mode)
  const tonicPc = tonicPcForFifths(signature.fifths, signature.mode)
  const semis = signature.mode === 'major' ? MAJOR_SEMIS : MINOR_SEMIS
  const scalePcs = semis.map((semi) => (tonicPc + semi) % 12)
  const scaleSet = new Set(scalePcs)
  const chords: RomanChord[] = []
  for (const symbol of symbols) {
    const parsed = parseChordSymbol(symbol)
    if (parsed === null) {
      return { ok: false, error: `unrecognized chord symbol "${symbol}" (expect e.g. "Am", "F#m7b5", "Bb7", "C/E")` }
    }
    const degree = (parsed.root.letterIndex - tonicLetter + 7) % 7
    const accidental = normalizeDiff(parsed.root.pc - scalePcs[degree]!)
    if (Math.abs(accidental) > 2) {
      return { ok: false, error: `root of "${symbol}" is ${Math.abs(accidental)} semitones from scale degree ${degree + 1} of ${signature.key}; that is not a chromatic alteration this tool names` }
    }
    const def = CHORDS[parsed.quality]!
    const notes: string[] = []
    for (let i = 0; i < def.letters.length; i += 1) {
      const li = (parsed.root.letterIndex + def.letters[i]!) % 7
      const pc = (((parsed.root.pc + def.semis[i]!) % 12) + 12) % 12
      let accidentalOfTone: number
      try {
        accidentalOfTone = spellOnLetter(pc, li)
      } catch {
        return { ok: false, error: `chord tone ${i + 1} of "${symbol}" needs more than a double accidental` }
      }
      notes.push(`${LETTERS[li]}${accidentalName(accidentalOfTone)}`)
    }
    const chordPcs = [...new Set(def.semis.map((semi) => (((parsed.root.pc + semi) % 12) + 12) % 12))]
    const inKey = chordPcs.every((pc) => scaleSet.has(pc))
    const prefix = accidental > 0 ? '#'.repeat(accidental) : 'b'.repeat(-accidental)
    const upper = UPPER_QUALITIES.has(parsed.quality)
    const suffix = ROMAN_SUFFIX[parsed.quality] ?? ''
    const numeral = `${prefix}${upper ? ROMAN[degree] : ROMAN[degree]!.toLowerCase()}`
    let roman = `${numeral}${suffix}`
    let inversion: number | undefined
    let bassInChord: boolean | undefined
    if (parsed.bass !== undefined) {
      const bassName = `${parsed.bass.letter}${accidentalName(parsed.bass.accidental)}`
      const index = chordPcs.indexOf(parsed.bass.pc)
      if (index >= 0) {
        inversion = index
        bassInChord = true
        const figured = figuredRoman(numeral, suffix, parsed.quality, index)
        if (figured !== null) roman = figured
        else roman = `${numeral}${suffix}/${bassName}`
      } else {
        bassInChord = false
        roman = `${numeral}${suffix}/${bassName}`
      }
    }
    const keyChordPcs = (size: number): number[] => {
      const out: number[] = []
      for (let j = 0; j < size; j += 1) out.push(scalePcs[(degree + 2 * j) % 7]!)
      return out
    }
    const size = chordPcs.length
    const diatonicSet = size === 3 || size === 4 ? keyChordPcs(size) : null
    const diatonic = diatonicSet === null
      ? inKey
      : diatonicSet.length === chordPcs.length && diatonicSet.every((pc) => chordPcs.includes(pc))
    const chord: RomanChord = {
      symbol: parsed.symbol,
      root: `${parsed.root.letter}${accidentalName(parsed.root.accidental)}`,
      quality: parsed.quality,
      degree: degree + 1,
      accidental,
      roman,
      inKey,
      diatonic,
      keyTriad: keyChordRoman(scalePcs, degree),
      notes,
    }
    if (parsed.bass !== undefined) chord.bass = `${parsed.bass.letter}${accidentalName(parsed.bass.accidental)}`
    if (inversion !== undefined) chord.inversion = inversion
    if (bassInChord !== undefined) chord.bassInChord = bassInChord
    chords.push(chord)
  }
  return {
    ok: true,
    value: {
      key: signature.key,
      mode: signature.mode,
      fifths: signature.fifths,
      progression: chords.map((c) => c.roman).join(' '),
      chords,
      diatonicCount: chords.filter((c) => c.diatonic).length,
    },
  }
}

/** Qualities whose roman numeral stays uppercase (major or no third). */
const UPPER_QUALITIES: ReadonlySet<string> = new Set([
  'maj', 'aug', 'sus2', 'sus4', '5', '6', '7', 'maj7', 'aug7', '7sus4',
  'add9', 'maj9', '9', '11', '13', 'maj13', '6/9',
])

/** Suffix the roman numeral carries for a quality. */
const ROMAN_SUFFIX: Readonly<Record<string, string>> = Object.freeze({
  maj: '',
  min: '',
  dim: '°',
  aug: '+',
  sus2: 'sus2',
  sus4: 'sus4',
  5: '5',
  6: '6',
  m6: '6',
  7: '7',
  maj7: 'maj7',
  m7: '7',
  m7b5: 'ø7',
  dim7: '°7',
  aug7: '+7',
  '7sus4': '7sus4',
  add9: 'add9',
  madd9: 'add9',
  maj9: 'maj9',
  9: '9',
  m9: '9',
  11: '11',
  m11: '11',
  13: '13',
  maj13: 'maj13',
  '6/9': '6/9',
})

/** Chord qualities that are plain triads (figured bass 6 / 64). */
const TRIAD_QUALITIES: ReadonlySet<string> = new Set(['maj', 'min', 'dim', 'aug'])
/** Chord qualities that are seventh chords (figured bass 65 / 43 / 42). */
const SEVENTH_QUALITIES: ReadonlySet<string> = new Set(['7', 'maj7', 'm7', 'm7b5', 'dim7', 'aug7'])

/**
 * Roman numeral for an inverted chord: triads take 6 / 64, seventh chords take
 * 65 / 43 / 42 and lose their trailing 7 (`G7` in third inversion is `V42`, not
 * `V742`). Qualities without a conventional figure return null, and the caller
 * falls back to a slash notation.
 */
function figuredRoman(numeral: string, suffix: string, quality: string, inversion: number): string | null {
  const tones = new Set(CHORDS[quality]!.semis.map((semi) => ((semi % 12) + 12) % 12)).size
  if (tones === 3 && TRIAD_QUALITIES.has(quality)) return `${numeral}${suffix}${['', '6', '64'][inversion] ?? ''}`
  if (tones === 4 && SEVENTH_QUALITIES.has(quality)) return `${numeral}${suffix.slice(0, -1)}${['', '65', '43', '42'][inversion] ?? ''}`
  return null
}
