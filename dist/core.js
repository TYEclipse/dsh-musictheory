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
//# sourceMappingURL=core.js.map