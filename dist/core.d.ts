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
export declare const LETTERS: readonly ["C", "D", "E", "F", "G", "A", "B"];
export declare const DIATONIC_PC: Readonly<Record<string, number>>;
/** Default A4 reference pitch in Hz (ISO 16). */
export declare const DEFAULT_A4 = 440;
/** MIDI note number of A4. */
export declare const MIDI_A4 = 69;
/** A parsed note: letter + accidental offset + octave resolved to a MIDI number. */
export interface ParsedNote {
    /** Uppercase letter, one of A-G. */
    letter: string;
    /** Index into LETTERS (C=0 ... B=6). */
    letterIndex: number;
    /** Accidental in semitones: -2 (bb) ... +2 (##/x). */
    accidental: number;
    /** Octave label as written (default 4 when omitted). */
    octave: number;
    /** Absolute MIDI note number (0-127). */
    midi: number;
    /** Pitch class 0-11 (C=0). */
    pc: number;
}
/**
 * Parse a note name like "C#4", "Db4", "B#4", "F##4", "Gx4" or bare "C".
 * Octave defaults to `defaultOctave` when omitted. Returns null when the
 * spelling is malformed or the resolved MIDI number is out of range.
 */
export declare function parseNote(input: string, defaultOctave?: number): ParsedNote | null;
/** Render an accidental offset as its textual form. */
export declare function accidentalName(diff: number): string;
/**
 * Normalize a pitch-class difference into [-6, 6], preferring the smaller
 * absolute value so single/double accidentals stay conventional.
 */
export declare function normalizeDiff(raw: number): number;
/**
 * Spell a target pitch class on a given letter: returns the accidental offset
 * that makes the letter sound at `targetPc` (in semitones, -2..+2 for the
 * tables used by this plugin; wider offsets throw).
 */
export declare function spellOnLetter(targetPc: number, letterIndex: number): number;
/** MIDI note number -> frequency in Hz for the given A4 reference. */
export declare function midiToFrequency(midi: number, a4Hz: number): number;
/** Frequency in Hz -> nearest MIDI note number (unrounded fractional value). */
export declare function frequencyToMidi(frequencyHz: number, a4Hz: number): number;
/** Cents deviation between a real frequency and a MIDI note's equal-tempered pitch. */
export declare function centsDeviation(frequencyHz: number, midi: number, a4Hz: number): number;
/** Format a spelled pitch (letter + accidental + octave) from absolute semitone info. */
export declare function formatSpelling(letterIndex: number, accidental: number, midi: number): string;
/** All conventional spellings (|offset| <= 1) of a MIDI pitch, natural spelling first. */
export declare function enharmonicsOf(midi: number): string[];
/** A chord quality definition: letter steps and semitone offsets from the root. */
export interface ChordDef {
    /** Letter-cycle offsets (root=0, third=2, ...). */
    letters: readonly number[];
    /** Semitone offsets from the root. */
    semis: readonly number[];
    /** Interval labels ("1", "b3", "5", "bb7", ...). */
    intervals: readonly string[];
}
export declare const CHORDS: Readonly<Record<string, ChordDef>>;
export declare const CHORD_QUALITIES: readonly string[];
/** A scale definition: letter steps, semitone offsets and interval labels. */
export interface ScaleDef {
    letters: readonly number[];
    semis: readonly number[];
    intervals: readonly string[];
}
/** Canonical scale type list (schema enum) with friendly aliases. */
export declare const SCALE_TYPES: readonly string[];
/** Resolve a scale type (including aliases) to its canonical definition name. */
export declare function resolveScaleType(type: string): string | null;
/** A fully spelled note with MIDI number and frequency. */
export interface NoteData {
    name: string;
    midi: number;
    frequencyHz: number;
}
/** Build a chord on `root` with the given quality. Returns null for unknown quality. */
export declare function buildChord(root: ParsedNote, quality: string, a4Hz: number): {
    chordName: string;
    notes: NoteData[];
    intervals: string[];
} | null;
/** Generate a scale on `root` of the given canonical type. Returns null for unknown type. */
export declare function generateScale(root: ParsedNote, type: string, a4Hz: number): {
    scaleName: string;
    notes: NoteData[];
    degrees: number[];
    intervals: string[];
} | null;
/** A canonical interval definition: number (1=unison, 8=octave, ...) and semitone size. */
export interface IntervalDef {
    /** Interval number, e.g. 3 for a third, 9 for a compound ninth. */
    number: number;
    /** Quality: perfect / major / minor / diminished / augmented. */
    quality: 'P' | 'M' | 'm' | 'd' | 'A';
    /** Semitone size (always ascending). */
    semis: number;
}
/** Canonical interval table (name -> definition). */
export declare const INTERVALS: Readonly<Record<string, IntervalDef>>;
/** Canonical interval names (schema enum). */
export declare const INTERVAL_NAMES: readonly string[];
/** Friendly aliases -> canonical interval names. */
export declare const INTERVAL_ALIASES: Readonly<Record<string, string>>;
/** Alias keys (schema enum extension). */
export declare const INTERVAL_ALIAS_KEYS: readonly string[];
/** Resolve a user-supplied interval name (canonical or alias) to its canonical name. */
export declare function resolveIntervalName(name: string): string | null;
/**
 * Map a pitch deviation (semitones - diatonic semitones) to an interval
 * quality. Perfect families (1/4/5 and their compounds) use P/A/d;
 * imperfect families (2/3/6/7) use M/m/A/d. Wider deviations clamp to
 * AA/dd labels while the exact semitone count is always reported.
 */
export declare function intervalQuality(number: number, delta: number): string;
/** A spelled target note produced by building an interval. */
export interface IntervalTarget {
    /** Spelled note name, e.g. "E4", "Ab3", "B#4". */
    name: string;
    /** MIDI note number. */
    midi: number;
    /** Canonical interval name as given. */
    interval: string;
    /** Semitone distance (always positive; direction is separate). */
    semitones: number;
    /** Travel direction from the root. */
    direction: 'ascending' | 'descending';
}
/**
 * Build the correctly spelled target note of `name` (canonical or alias)
 * from `root` in the given direction. Returns null for unknown intervals,
 * unspellable targets or results outside the MIDI range.
 */
export declare function buildIntervalTarget(root: ParsedNote, name: string, direction?: 'ascending' | 'descending'): IntervalTarget | null;
/** Named interval between two notes. */
export interface IntervalAnalysis {
    /** Interval name, e.g. "M3", "d5", "M10", "P1". */
    name: string;
    /** Absolute semitone distance. */
    semitones: number;
    /** Travel direction from note1's perspective. */
    direction: 'ascending' | 'descending' | 'unison';
    /** Octave count embedded in the interval (0 for simple intervals). */
    octaves: number;
    /** Octave-reduced simple form, e.g. "M3" for "M10". */
    simple: string;
    /** True when the interval spans more than an octave. */
    compound: boolean;
}
/**
 * Name the interval between two parsed notes. The letter distance between
 * the spellings decides the number (C->F# is an A4, C->Gb a d5), the
 * semitone distance decides the quality. Direction is reported separately.
 */
export declare function analyzeInterval(note1: ParsedNote, note2: ParsedNote): IntervalAnalysis;
/** A spelled scale note carrying the spelling engine's letter + accidental. */
export interface SpelledScaleNote {
    name: string;
    midi: number;
    letterIndex: number;
    accidental: number;
}
/** Spell the notes of a canonical scale on `root` (letters + accidentals resolved). */
export declare function spellScaleNotes(root: ParsedNote, canonicalType: string): SpelledScaleNote[] | null;
/** Scale types that can be harmonized (heptatonic: triads/sevenths stack cleanly). */
export declare const HARMONIZABLE_SCALES: readonly string[];
/** One harmonized chord of a scale. */
export interface HarmonyChord {
    /** Scale degree, 1-7. */
    degree: number;
    /** Roman numeral with quality suffix, e.g. "I", "ii", "vii°", "V7", "iiø7". */
    roman: string;
    /** Triad/seventh quality in plain English. */
    quality: string;
    /** Spelled note names. */
    notes: string[];
    /** MIDI note numbers. */
    midis: number[];
}
/** Roman numeral for a scale degree with its quality. */
export declare function romanFor(degree: number, quality: string, sevenths: boolean): string;
/**
 * Harmonize a heptatonic scale: stack thirds (or sevenths) on every scale
 * degree with correct spelling (G# major V = D# F## A#, harmonic minor
 * III is augmented). Returns null for non-heptatonic or unknown types.
 */
export declare function harmonizeScale(root: ParsedNote, canonicalType: string, sevenths?: boolean): {
    progression: string;
    harmony: HarmonyChord[];
} | null;
//# sourceMappingURL=core.d.ts.map