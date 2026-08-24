/**
 * Tool definitions for dsh-musictheory: four deterministic music-theory tools
 * exposed to every agent via defineTool. Strict JSON-schema parameter surfaces,
 * explicit result interfaces matching the inferred output types.
 *
 * @module dsh-musictheory/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { buildChord, centsDeviation, CHORD_QUALITIES, DEFAULT_A4, enharmonicsOf, frequencyToMidi, generateScale, midiToFrequency, parseNote, SCALE_TYPES, } from "./core.js";
/** Reject obviously bad A4 references; fall back to the configured default. */
function validA4(a4Hz, config) {
    if (a4Hz === undefined)
        return config.a4Hz;
    if (!Number.isFinite(a4Hz) || a4Hz <= 0)
        return null;
    return a4Hz;
}
const A4_ERROR = `a4Hz must be a positive number (standard is ${DEFAULT_A4} Hz)`;
function renderNoteInfo(value) {
    const r = value;
    if (!r.valid)
        return `invalid note: ${r.error ?? 'unknown error'}`;
    const enh = r.enharmonics === undefined || r.enharmonics.length === 0 ? '' : `  (also: ${r.enharmonics.join(', ')})`;
    return `${r.note}: MIDI ${r.midi}, octave ${r.octave}, pitch class ${r.pitchClass}, ${r.frequencyHz} Hz${enh}`;
}
function renderFreqToNote(value) {
    const r = value;
    if (!r.valid)
        return `invalid frequency: ${r.error ?? 'unknown error'}`;
    const range = r.inMidiRange === true ? '' : ' (outside MIDI 0-127 range)';
    const enh = r.enharmonics === undefined || r.enharmonics.length === 0 ? '' : `  (also: ${r.enharmonics.join(', ')})`;
    return `${r.frequencyHz} Hz -> ${r.note} (MIDI ${r.midi}, ${r.centsDeviation} cents)${range}${enh}`;
}
function renderChord(value) {
    const r = value;
    if (!r.valid)
        return `invalid chord: ${r.error ?? 'unknown error'}`;
    const notes = (r.notes ?? []).map((n) => n.name).join(' ');
    const freqs = (r.notes ?? []).map((n) => n.frequencyHz).join('/');
    return `${r.chordName}: ${notes}  (intervals ${(r.intervals ?? []).join(' ')}, ${freqs} Hz)`;
}
function renderScale(value) {
    const r = value;
    if (!r.valid)
        return `invalid scale: ${r.error ?? 'unknown error'}`;
    const notes = (r.notes ?? []).map((n) => n.name).join(' ');
    const degrees = (r.degrees ?? []).join(' ');
    const intervals = (r.intervals ?? []).join(' ');
    return `${r.scaleName}: ${notes}\n  degrees: ${degrees}\n  intervals: ${intervals}`;
}
/** Build all four tool definitions from the resolved config. */
export function buildMusicTools(config) {
    const note_info = defineTool({
        name: 'note_info',
        description: 'Parse a musical note name (e.g. "C#4", "Db4", "B#4", "F##4") and report its MIDI number, '
            + 'octave, pitch class and exact 12-TET frequency. Also lists all conventional enharmonic spellings '
            + '(B#4 is the same pitch as C5). Use this instead of mental arithmetic for pitch math.',
        parameters: {
            note: { type: 'string', required: true, description: 'Note name: letter A-G, optional accidentals (#, ##, x, b, bb) and optional octave, e.g. "C#4", "Bb3", "Gx4". Octave defaults to 4 when omitted.' },
            a4Hz: { type: 'number', description: `A4 reference pitch in Hz (default ${DEFAULT_A4}). Use 442/432/415 for alternative tunings.` },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    note: { type: 'string' },
                    midi: { type: 'number' },
                    octave: { type: 'number' },
                    pitchClass: { type: 'number' },
                    frequencyHz: { type: 'number' },
                    enharmonics: { type: 'array', items: { type: 'string' } },
                    error: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderNoteInfo(value) }],
        },
        async execute(args) {
            const a4 = validA4(args.a4Hz, config);
            if (a4 === null)
                return { valid: false, error: A4_ERROR };
            const parsed = parseNote(args.note);
            if (parsed === null)
                return { valid: false, error: `unrecognized note "${args.note}" (expect e.g. "C#4", "Bb3", "F##4")` };
            return {
                valid: true,
                note: args.note.trim(),
                midi: parsed.midi,
                octave: Math.floor(parsed.midi / 12) - 1,
                pitchClass: parsed.pc,
                frequencyHz: midiToFrequency(parsed.midi, a4),
                enharmonics: enharmonicsOf(parsed.midi),
            };
        },
    });
    const freq_to_note = defineTool({
        name: 'freq_to_note',
        description: 'Convert a frequency in Hz to the nearest 12-TET note: name, MIDI number, cents deviation '
            + 'and enharmonic spellings. Useful for identifying pitches from tuners, DSP code or measurements.',
        parameters: {
            frequencyHz: { type: 'number', required: true, description: 'Frequency in Hz, e.g. 261.63 or 442.' },
            a4Hz: { type: 'number', description: `A4 reference pitch in Hz (default ${DEFAULT_A4}).` },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    note: { type: 'string' },
                    midi: { type: 'number' },
                    frequencyHz: { type: 'number' },
                    centsDeviation: { type: 'number' },
                    inMidiRange: { type: 'boolean' },
                    enharmonics: { type: 'array', items: { type: 'string' } },
                    error: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderFreqToNote(value) }],
        },
        async execute(args) {
            const a4 = validA4(args.a4Hz, config);
            if (a4 === null)
                return { valid: false, error: A4_ERROR };
            if (!Number.isFinite(args.frequencyHz) || args.frequencyHz <= 0) {
                return { valid: false, error: `frequencyHz must be a positive number (got ${args.frequencyHz})` };
            }
            const midiFloat = frequencyToMidi(args.frequencyHz, a4);
            const midi = Math.round(midiFloat);
            const inMidiRange = midi >= 0 && midi <= 127;
            const result = {
                valid: true,
                midi,
                frequencyHz: args.frequencyHz,
                centsDeviation: centsDeviation(args.frequencyHz, midi, a4),
                inMidiRange,
            };
            if (inMidiRange) {
                const spellings = enharmonicsOf(midi);
                result.note = spellings[0];
                result.enharmonics = spellings;
            }
            return result;
        },
    });
    const chord_build = defineTool({
        name: 'chord_build',
        description: 'Build a chord from a root note and a quality (maj, min, dim, aug, sus2, sus4, 5, 6, m6, 7, '
            + 'maj7, m7, m7b5, dim7, aug7, 7sus4, add9, madd9, maj9, 9, m9, 11, m11, 13, maj13, 6/9) and return the '
            + 'correctly spelled notes (G# major is G# B# D#, NOT G# C D#), MIDI numbers and frequencies. '
            + 'Trust the spelling engine over hand-written chord names.',
        parameters: {
            root: { type: 'string', required: true, description: 'Root note name with optional octave, e.g. "C4", "G#", "Bb3". Octave defaults to 4.' },
            quality: { type: 'string', enum: [...CHORD_QUALITIES], description: 'Chord quality, e.g. "maj7", "m7b5", "sus4".' },
            a4Hz: { type: 'number', description: `A4 reference pitch in Hz (default ${DEFAULT_A4}).` },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    chordName: { type: 'string' },
                    notes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                name: { type: 'string', required: true },
                                midi: { type: 'number', required: true },
                                frequencyHz: { type: 'number', required: true },
                            },
                        },
                    },
                    intervals: { type: 'array', items: { type: 'string' } },
                    error: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderChord(value) }],
        },
        async execute(args) {
            const a4 = validA4(args.a4Hz, config);
            if (a4 === null)
                return { valid: false, error: A4_ERROR };
            const parsed = parseNote(args.root);
            if (parsed === null)
                return { valid: false, error: `unrecognized root "${args.root}"` };
            const quality = args.quality ?? 'maj';
            const chord = buildChord(parsed, quality, a4);
            if (chord === null)
                return { valid: false, error: `unknown chord quality "${quality}"` };
            return { valid: true, chordName: chord.chordName, notes: chord.notes, intervals: chord.intervals };
        },
    });
    const scale_generate = defineTool({
        name: 'scale_generate',
        description: 'Generate a musical scale from a root note and a type (major/ionian, natural_minor/minor/aeolian, '
            + 'harmonic_minor, melodic_minor, dorian, phrygian, lydian, mixolydian, locrian, major_pentatonic, '
            + 'minor_pentatonic, blues, whole_tone, chromatic) with correctly spelled notes, degrees, intervals and '
            + 'frequencies. F# major is F# G# A# B C# D# E# — never trust a hand-written sharp/flat count.',
        parameters: {
            root: { type: 'string', required: true, description: 'Root note name with optional octave, e.g. "F#", "C4", "Bb3". Octave defaults to 4.' },
            type: { type: 'string', enum: [...SCALE_TYPES], description: 'Scale type, e.g. "harmonic_minor", "blues", "major".' },
            a4Hz: { type: 'number', description: `A4 reference pitch in Hz (default ${DEFAULT_A4}).` },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    scaleName: { type: 'string' },
                    notes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                name: { type: 'string', required: true },
                                midi: { type: 'number', required: true },
                                frequencyHz: { type: 'number', required: true },
                            },
                        },
                    },
                    degrees: { type: 'array', items: { type: 'number' } },
                    intervals: { type: 'array', items: { type: 'string' } },
                    error: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderScale(value) }],
        },
        async execute(args) {
            const a4 = validA4(args.a4Hz, config);
            if (a4 === null)
                return { valid: false, error: A4_ERROR };
            const parsed = parseNote(args.root);
            if (parsed === null)
                return { valid: false, error: `unrecognized root "${args.root}"` };
            const type = args.type ?? 'major';
            const scale = generateScale(parsed, type, a4);
            if (scale === null)
                return { valid: false, error: `unknown scale type "${type}"` };
            return { valid: true, scaleName: scale.scaleName, notes: scale.notes, degrees: scale.degrees, intervals: scale.intervals };
        },
    });
    return { note_info, freq_to_note, chord_build, scale_generate };
}
//# sourceMappingURL=tools.js.map