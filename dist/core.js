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
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const DIATONIC_PC = Object.freeze({
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
});
/** Default A4 reference pitch in Hz (ISO 16). */
export const DEFAULT_A4 = 440;
/** MIDI note number of A4. */
export const MIDI_A4 = 69;
const NOTE_RE = /^([A-Ga-g])((?:#{1,2}|x|b{1,2}))?(-?\d+)?$/;
function accidentalSemis(acc) {
    switch (acc) {
        case '#': return 1;
        case '##': return 2;
        case 'x': return 2;
        case 'b': return -1;
        case 'bb': return -2;
        default: return 0;
    }
}
/**
 * Parse a note name like "C#4", "Db4", "B#4", "F##4", "Gx4" or bare "C".
 * Octave defaults to `defaultOctave` when omitted. Returns null when the
 * spelling is malformed or the resolved MIDI number is out of range.
 */
export function parseNote(input, defaultOctave = 4) {
    const match = NOTE_RE.exec(input.trim());
    if (match === null)
        return null;
    const letter = match[1].toUpperCase();
    const accText = match[2] ?? '';
    const octave = match[3] === undefined ? defaultOctave : Number(match[3]);
    if (!Number.isInteger(octave))
        return null;
    const letterIndex = LETTERS.indexOf(letter);
    const accidental = accidentalSemis(accText);
    const midi = (octave + 1) * 12 + DIATONIC_PC[letter] + accidental;
    if (midi < 0 || midi > 127)
        return null;
    const pc = ((midi % 12) + 12) % 12;
    return { letter, letterIndex, accidental, octave, midi, pc };
}
/** Render an accidental offset as its textual form. */
export function accidentalName(diff) {
    switch (diff) {
        case 0: return '';
        case 1: return '#';
        case 2: return '##';
        case -1: return 'b';
        case -2: return 'bb';
        default: throw new Error(`unspellable accidental offset ${diff}`);
    }
}
/**
 * Normalize a pitch-class difference into [-6, 6], preferring the smaller
 * absolute value so single/double accidentals stay conventional.
 */
export function normalizeDiff(raw) {
    let x = ((raw % 12) + 12) % 12;
    if (x > 6)
        x -= 12;
    return x;
}
/**
 * Spell a target pitch class on a given letter: returns the accidental offset
 * that makes the letter sound at `targetPc` (in semitones, -2..+2 for the
 * tables used by this plugin; wider offsets throw).
 */
export function spellOnLetter(targetPc, letterIndex) {
    const base = DIATONIC_PC[LETTERS[letterIndex]];
    const diff = normalizeDiff(targetPc - base);
    if (diff > 2 || diff < -2)
        throw new Error(`unspellable pitch class ${targetPc} on letter ${LETTERS[letterIndex]}`);
    return diff;
}
/** MIDI note number -> frequency in Hz for the given A4 reference. */
export function midiToFrequency(midi, a4Hz) {
    return a4Hz * 2 ** ((midi - MIDI_A4) / 12);
}
/** Frequency in Hz -> nearest MIDI note number (unrounded fractional value). */
export function frequencyToMidi(frequencyHz, a4Hz) {
    return MIDI_A4 + 12 * Math.log2(frequencyHz / a4Hz);
}
/** Cents deviation between a real frequency and a MIDI note's equal-tempered pitch. */
export function centsDeviation(frequencyHz, midi, a4Hz) {
    return 1200 * Math.log2(frequencyHz / midiToFrequency(midi, a4Hz));
}
/** Format a spelled pitch (letter + accidental + octave) from absolute semitone info. */
export function formatSpelling(letterIndex, accidental, midi) {
    const semitone = DIATONIC_PC[LETTERS[letterIndex]] + accidental;
    const register = (midi - semitone) / 12;
    const octave = register - 1;
    return `${LETTERS[letterIndex]}${accidentalName(accidental)}${octave}`;
}
/** All conventional spellings (|offset| <= 1) of a MIDI pitch, natural spelling first. */
export function enharmonicsOf(midi) {
    const pc = ((midi % 12) + 12) % 12;
    const candidates = [];
    for (let li = 0; li < 7; li += 1) {
        const base = DIATONIC_PC[LETTERS[li]];
        const diff = normalizeDiff(pc - base);
        if (Math.abs(diff) <= 1)
            candidates.push({ name: formatSpelling(li, diff, midi), diff });
    }
    candidates.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || b.diff - a.diff);
    return candidates.map((c) => c.name);
}
export const CHORDS = Object.freeze({
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
});
export const CHORD_QUALITIES = Object.keys(CHORDS);
const SCALE_TABLE = Object.freeze({
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
});
/** Canonical scale type list (schema enum) with friendly aliases. */
export const SCALE_TYPES = [
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
];
const SCALE_ALIASES = Object.freeze({
    ionian: 'major',
    minor: 'natural_minor',
    aeolian: 'natural_minor',
});
/** Resolve a scale type (including aliases) to its canonical definition name. */
export function resolveScaleType(type) {
    const canonical = SCALE_ALIASES[type] ?? type;
    return canonical in SCALE_TABLE ? canonical : null;
}
function spellSequence(root, def, a4Hz) {
    return def.semis.map((semi, i) => {
        const letterIndex = (root.letterIndex + def.letters[i]) % 7;
        const targetPc = (root.pc + semi) % 12;
        const accidental = spellOnLetter(targetPc, letterIndex);
        const midi = root.midi + semi;
        return {
            name: formatSpelling(letterIndex, accidental, midi),
            midi,
            frequencyHz: midiToFrequency(midi, a4Hz),
        };
    });
}
/** Build a chord on `root` with the given quality. Returns null for unknown quality. */
export function buildChord(root, quality, a4Hz) {
    const def = CHORDS[quality];
    if (def === undefined)
        return null;
    const notes = spellSequence(root, def, a4Hz);
    const chordName = `${root.letter}${accidentalName(root.accidental)}${quality}`;
    return { chordName, notes, intervals: [...def.intervals] };
}
/** Generate a scale on `root` of the given canonical type. Returns null for unknown type. */
export function generateScale(root, type, a4Hz) {
    const canonical = resolveScaleType(type);
    if (canonical === null)
        return null;
    const def = SCALE_TABLE[canonical];
    const notes = spellSequence(root, def, a4Hz);
    const scaleName = `${root.letter}${accidentalName(root.accidental)} ${canonical.replaceAll('_', ' ')}`;
    return { scaleName, notes, degrees: def.semis.map((_, i) => i + 1), intervals: [...def.intervals] };
}
/** Canonical interval table (name -> definition). */
export const INTERVALS = Object.freeze({
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
});
/** Canonical interval names (schema enum). */
export const INTERVAL_NAMES = Object.keys(INTERVALS);
/** Friendly aliases -> canonical interval names. */
export const INTERVAL_ALIASES = Object.freeze({
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
});
/** Alias keys (schema enum extension). */
export const INTERVAL_ALIAS_KEYS = Object.keys(INTERVAL_ALIASES);
/** Resolve a user-supplied interval name (canonical or alias) to its canonical name. */
export function resolveIntervalName(name) {
    const trimmed = name.trim();
    if (INTERVALS[trimmed] !== undefined)
        return trimmed;
    return INTERVAL_ALIASES[trimmed] ?? null;
}
/** Diatonic semitone size of a simple interval number (1-7). */
const DIATONIC_SEMIS = Object.freeze({
    1: 0,
    2: 2,
    3: 4,
    4: 5,
    5: 7,
    6: 9,
    7: 11,
});
/**
 * Map a pitch deviation (semitones - diatonic semitones) to an interval
 * quality. Perfect families (1/4/5 and their compounds) use P/A/d;
 * imperfect families (2/3/6/7) use M/m/A/d. Wider deviations clamp to
 * AA/dd labels while the exact semitone count is always reported.
 */
export function intervalQuality(number, delta) {
    const simple = ((number - 1) % 7) + 1;
    const perfect = simple === 1 || simple === 4 || simple === 5;
    if (perfect) {
        if (delta >= 2)
            return 'AA';
        if (delta === 1)
            return 'A';
        if (delta === 0)
            return 'P';
        if (delta === -1)
            return 'd';
        return 'dd';
    }
    if (delta >= 2)
        return 'AA';
    if (delta === 1)
        return 'A';
    if (delta === 0)
        return 'M';
    if (delta === -1)
        return 'm';
    if (delta === -2)
        return 'd';
    return 'dd';
}
/**
 * Build the correctly spelled target note of `name` (canonical or alias)
 * from `root` in the given direction. Returns null for unknown intervals,
 * unspellable targets or results outside the MIDI range.
 */
export function buildIntervalTarget(root, name, direction = 'ascending') {
    const canonical = resolveIntervalName(name);
    if (canonical === null)
        return null;
    const def = INTERVALS[canonical];
    const descending = direction === 'descending';
    const letterSteps = (def.number - 1) % 7;
    const li2 = descending ? (root.letterIndex - letterSteps + 7) % 7 : (root.letterIndex + letterSteps) % 7;
    const pc2 = descending ? (((root.pc - def.semis) % 12) + 12) % 12 : (root.pc + def.semis) % 12;
    const midi2 = descending ? root.midi - def.semis : root.midi + def.semis;
    if (midi2 < 0 || midi2 > 127)
        return null;
    let accidental;
    try {
        accidental = spellOnLetter(pc2, li2);
    }
    catch {
        return null;
    }
    return {
        name: formatSpelling(li2, accidental, midi2),
        midi: midi2,
        interval: canonical,
        semitones: def.semis,
        direction: descending ? 'descending' : 'ascending',
    };
}
/**
 * Name the interval between two parsed notes. The letter distance between
 * the spellings decides the number (C->F# is an A4, C->Gb a d5), the
 * semitone distance decides the quality. Direction is reported separately.
 */
export function analyzeInterval(note1, note2) {
    const d = note2.midi - note1.midi;
    const ad = Math.abs(d);
    if (d === 0 && note1.letterIndex === note2.letterIndex) {
        return { name: 'P1', semitones: 0, direction: 'unison', octaves: 0, simple: 'P1', compound: false };
    }
    let loLetter;
    let hiLetter;
    let direction;
    if (d > 0) {
        loLetter = note1.letterIndex;
        hiLetter = note2.letterIndex;
        direction = 'ascending';
    }
    else if (d < 0) {
        loLetter = note2.letterIndex;
        hiLetter = note1.letterIndex;
        direction = 'descending';
    }
    else {
        // Equal pitch, different letters: use the (octave * 7 + letter) order.
        const key1 = note1.octave * 7 + note1.letterIndex;
        const key2 = note2.octave * 7 + note2.letterIndex;
        if (key1 < key2) {
            loLetter = note1.letterIndex;
            hiLetter = note2.letterIndex;
            direction = 'ascending';
        }
        else {
            loLetter = note2.letterIndex;
            hiLetter = note1.letterIndex;
            direction = 'descending';
        }
    }
    const letterSteps = (hiLetter - loLetter + 7) % 7;
    const numberSimple = letterSteps + 1;
    const diatonic = DIATONIC_SEMIS[numberSimple];
    const k = Math.max(0, Math.round((ad - diatonic) / 12));
    const number = numberSimple + 7 * k;
    const delta = ad - (diatonic + 12 * k);
    const quality = intervalQuality(number, delta);
    const simple = k === 0 ? `${quality}${number}` : `${intervalQuality(numberSimple, delta)}${numberSimple}`;
    return {
        name: `${quality}${number}`,
        semitones: ad,
        direction,
        octaves: k,
        simple,
        compound: k > 0,
    };
}
/** Spell the notes of a canonical scale on `root` (letters + accidentals resolved). */
export function spellScaleNotes(root, canonicalType) {
    const canonical = resolveScaleType(canonicalType);
    if (canonical === null)
        return null;
    const def = SCALE_TABLE[canonical];
    if (def === undefined)
        return null;
    return def.semis.map((semi, i) => {
        const letterIndex = (root.letterIndex + def.letters[i]) % 7;
        const targetPc = (root.pc + semi) % 12;
        const accidental = spellOnLetter(targetPc, letterIndex);
        const midi = root.midi + semi;
        return { name: formatSpelling(letterIndex, accidental, midi), midi, letterIndex, accidental };
    });
}
/** Scale types that can be harmonized (heptatonic: triads/sevenths stack cleanly). */
export const HARMONIZABLE_SCALES = Object.keys(SCALE_TABLE).filter((key) => SCALE_TABLE[key].letters.length === 7);
function triadQuality(s1, s2) {
    if (s1 === 4 && s2 === 7)
        return 'major';
    if (s1 === 3 && s2 === 7)
        return 'minor';
    if (s1 === 3 && s2 === 6)
        return 'diminished';
    if (s1 === 4 && s2 === 8)
        return 'augmented';
    return 'other';
}
function seventhQuality(s) {
    const [a, b, c] = s;
    if (a === 4 && b === 7 && c === 11)
        return 'major7';
    if (a === 3 && b === 7 && c === 10)
        return 'minor7';
    if (a === 4 && b === 7 && c === 10)
        return 'dominant7';
    if (a === 3 && b === 6 && c === 10)
        return 'halfDiminished7';
    if (a === 3 && b === 6 && c === 9)
        return 'diminished7';
    if (a === 4 && b === 8 && c === 10)
        return 'augmented7';
    if (a === 3 && b === 7 && c === 11)
        return 'minorMajor7';
    return 'other';
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** Roman numeral for a scale degree with its quality. */
export function romanFor(degree, quality, sevenths) {
    const base = ROMAN[degree] ?? '?';
    if (sevenths) {
        switch (quality) {
            case 'major7': return `${base}maj7`;
            case 'minor7': return `${base.toLowerCase()}7`;
            case 'dominant7': return `${base}7`;
            case 'halfDiminished7': return `${base.toLowerCase()}ø7`;
            case 'diminished7': return `${base.toLowerCase()}°7`;
            case 'augmented7': return `${base}+7`;
            case 'minorMajor7': return `${base.toLowerCase()}(maj7)`;
            default: return `${base.toLowerCase()}?7`;
        }
    }
    switch (quality) {
        case 'major': return base;
        case 'minor': return base.toLowerCase();
        case 'diminished': return `${base.toLowerCase()}°`;
        case 'augmented': return `${base}+`;
        default: return `${base.toLowerCase()}?`;
    }
}
/**
 * Harmonize a heptatonic scale: stack thirds (or sevenths) on every scale
 * degree with correct spelling (G# major V = D# F## A#, harmonic minor
 * III is augmented). Returns null for non-heptatonic or unknown types.
 */
export function harmonizeScale(root, canonicalType, sevenths = false) {
    const scale = spellScaleNotes(root, canonicalType);
    if (scale === null || scale.length !== 7)
        return null;
    const count = sevenths ? 4 : 3;
    const harmony = [];
    for (let degree = 0; degree < 7; degree += 1) {
        const midis = [];
        const notes = [];
        for (let j = 0; j < count; j += 1) {
            const p = (degree + 2 * j) % 7;
            const bump = Math.floor((degree + 2 * j) / 7);
            const note = scale[p];
            const midi = note.midi + 12 * bump;
            midis.push(midi);
            notes.push(formatSpelling(note.letterIndex, note.accidental, midi));
        }
        const s1 = (((midis[1] - midis[0]) % 12) + 12) % 12;
        const s2 = (((midis[2] - midis[0]) % 12) + 12) % 12;
        let quality;
        if (sevenths) {
            const s3 = (((midis[3] - midis[0]) % 12) + 12) % 12;
            quality = seventhQuality([s1, s2, s3]);
        }
        else {
            quality = triadQuality(s1, s2);
        }
        harmony.push({
            degree: degree + 1,
            roman: romanFor(degree, quality, sevenths),
            quality,
            notes,
            midis,
        });
    }
    return { progression: harmony.map((h) => h.roman).join(' '), harmony };
}
//# sourceMappingURL=core.js.map