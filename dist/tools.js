/**
 * Tool definitions for dsh-musictheory: four deterministic music-theory tools
 * exposed to every agent via defineTool. Strict JSON-schema parameter surfaces,
 * explicit result interfaces matching the inferred output types.
 *
 * @module dsh-musictheory/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { accidentalName, analyzeInterval, buildChord, buildIntervalTarget, centsDeviation, CHORD_QUALITIES, DEFAULT_A4, enharmonicsOf, frequencyToMidi, generateScale, harmonizeScale, HARMONIZABLE_SCALES, INTERVAL_ALIAS_KEYS, INTERVAL_NAMES, midiToFrequency, parseNote, resolveIntervalName, resolveScaleType, SCALE_TYPES, } from "./core.js";
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
function renderIntervalBuild(value) {
    const r = value;
    if (!r.valid)
        return `invalid interval: ${r.error ?? 'unknown error'}`;
    const arrow = r.direction === 'descending' ? 'down' : 'up';
    return `target: ${r.targetNote} (MIDI ${r.midi}, ${r.frequencyHz} Hz) — ${r.interval} ${arrow} (${r.semitones} semitones)`;
}
function renderIntervalInfo(value) {
    const r = value;
    if (!r.valid)
        return `invalid notes: ${r.error ?? 'unknown error'}`;
    const compound = r.compound === true ? ` (compound: ${r.simple} + ${r.octaves} octave${r.octaves === 1 ? '' : 's'})` : '';
    return `${r.name} — ${r.semitones} semitones, ${r.direction}${compound}`;
}
function renderScaleHarmony(value) {
    const r = value;
    if (!r.valid)
        return `invalid harmony: ${r.error ?? 'unknown error'}`;
    const label = r.sevenths === true ? 'seventh chords' : 'triads';
    const lines = (r.harmony ?? []).map((h) => `  ${h.roman.padEnd(7)} ${h.notes.join(' ')} (${h.quality})`);
    return `${r.scaleName} (${label}): ${r.progression}\n${lines.join('\n')}`;
}
/** Build all seven tool definitions from the resolved config. */
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
    const interval_build = defineTool({
        name: 'interval_build',
        description: 'Build the correctly spelled target note of a musical interval from a root note. '
            + 'Works upward or downward, understands compound intervals (M9, M10, P11, P15) and resolves '
            + 'spelling through the letter ladder (G# up a M3 is B#, NOT C; C up a d5 is Gb, up an A4 is F#). '
            + 'Use this instead of mental semitone arithmetic.',
        parameters: {
            root: { type: 'string', required: true, description: 'Root note name, e.g. "C4", "G#", "Bb3". Octave defaults to 4.' },
            interval: { type: 'string', enum: [...INTERVAL_NAMES, ...INTERVAL_ALIAS_KEYS], description: 'Interval name: canonical ("M3", "P5", "m7", "A4", "d5", "M9", "P15") or alias ("tritone", "octave", "unison", "semitone").' },
            direction: { type: 'string', enum: ['ascending', 'descending'], description: 'Direction from the root. Default ascending.' },
            a4Hz: { type: 'number', description: `A4 reference pitch in Hz (default ${DEFAULT_A4}).` },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    targetNote: { type: 'string' },
                    midi: { type: 'number' },
                    frequencyHz: { type: 'number' },
                    interval: { type: 'string' },
                    semitones: { type: 'number' },
                    direction: { type: 'string', enum: ['ascending', 'descending'] },
                    error: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderIntervalBuild(value) }],
        },
        async execute(args) {
            const a4 = validA4(args.a4Hz, config);
            if (a4 === null)
                return { valid: false, error: A4_ERROR };
            const parsed = parseNote(args.root);
            if (parsed === null)
                return { valid: false, error: `unrecognized root "${args.root}"` };
            const name = args.interval ?? 'P5';
            if (resolveIntervalName(name) === null) {
                return { valid: false, error: `unknown interval "${name}" (use canonical names like M3/P5/m7/A4/d5 or aliases like tritone/octave/semitone)` };
            }
            const direction = args.direction === 'descending' ? 'descending' : 'ascending';
            const target = buildIntervalTarget(parsed, name, direction);
            if (target === null) {
                return { valid: false, error: `cannot spell interval "${name}" from "${args.root.trim()}" (target may fall outside the MIDI 0-127 range)` };
            }
            return {
                valid: true,
                targetNote: target.name,
                midi: target.midi,
                frequencyHz: midiToFrequency(target.midi, a4),
                interval: target.interval,
                semitones: target.semitones,
                direction: target.direction,
            };
        },
    });
    const interval_info = defineTool({
        name: 'interval_info',
        description: 'Name the interval between two notes. The letter distance between the spellings '
            + 'decides the number (C->F# is an augmented 4th, C->Gb a diminished 5th), the semitone count '
            + 'decides the quality, and the direction is reported separately. Compound intervals (C4->D5) '
            + 'come back with their octave-reduced simple form (M9 -> M2 + 1 octave).',
        parameters: {
            note1: { type: 'string', required: true, description: 'First note, e.g. "C4", "Gb4", "B#3". Octave defaults to 4.' },
            note2: { type: 'string', required: true, description: 'Second note to measure the interval to, e.g. "F#4", "D5".' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    name: { type: 'string' },
                    semitones: { type: 'number' },
                    direction: { type: 'string', enum: ['ascending', 'descending', 'unison'] },
                    octaves: { type: 'number' },
                    simple: { type: 'string' },
                    compound: { type: 'boolean' },
                    error: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderIntervalInfo(value) }],
        },
        async execute(args) {
            const n1 = parseNote(args.note1);
            if (n1 === null)
                return { valid: false, error: `unrecognized note "${args.note1}"` };
            const n2 = parseNote(args.note2);
            if (n2 === null)
                return { valid: false, error: `unrecognized note "${args.note2}"` };
            const analysis = analyzeInterval(n1, n2);
            return {
                valid: true,
                name: analysis.name,
                semitones: analysis.semitones,
                direction: analysis.direction,
                octaves: analysis.octaves,
                simple: analysis.simple,
                compound: analysis.compound,
            };
        },
    });
    const scale_harmonize = defineTool({
        name: 'scale_harmonize',
        description: 'Harmonize a 7-note scale: stack thirds on every scale degree to get the diatonic '
            + 'triads (C major -> I ii iii IV V vi vii°) with roman numerals, plain-English qualities and '
            + 'correctly spelled notes (G# major V = D# F## A#; harmonic minor III is augmented). '
            + 'Pass sevenths: true for seventh chords (Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7). '
            + 'Pentatonic/blues/whole-tone/chromatic scales cannot be harmonized this way.',
        parameters: {
            root: { type: 'string', required: true, description: 'Root note name, e.g. "C4", "F#", "A4". Octave defaults to 4.' },
            type: { type: 'string', enum: [...SCALE_TYPES], description: 'Scale type, e.g. "major", "harmonic_minor", "dorian" (7-note scales only).' },
            sevenths: { type: 'boolean', description: 'Stack four notes per degree (seventh chords) instead of triads. Default false.' },
            a4Hz: { type: 'number', description: `A4 reference pitch in Hz (default ${DEFAULT_A4}; used for consistency, no frequencies in the output).` },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    scaleName: { type: 'string' },
                    progression: { type: 'string' },
                    sevenths: { type: 'boolean' },
                    harmony: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                degree: { type: 'number', required: true },
                                roman: { type: 'string', required: true },
                                quality: { type: 'string', required: true },
                                notes: { type: 'array', items: { type: 'string' }, required: true },
                                midis: { type: 'array', items: { type: 'number' }, required: true },
                            },
                        },
                    },
                    error: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderScaleHarmony(value) }],
        },
        async execute(args) {
            const a4 = validA4(args.a4Hz, config);
            if (a4 === null)
                return { valid: false, error: A4_ERROR };
            const parsed = parseNote(args.root);
            if (parsed === null)
                return { valid: false, error: `unrecognized root "${args.root}"` };
            const type = args.type ?? 'major';
            const canonical = resolveScaleType(type);
            if (canonical === null)
                return { valid: false, error: `unknown scale type "${type}"` };
            if (!HARMONIZABLE_SCALES.includes(canonical)) {
                return { valid: false, error: `scale type "${type}" cannot be harmonized (only 7-note scales stack cleanly)` };
            }
            const sevenths = args.sevenths === true;
            const result = harmonizeScale(parsed, canonical, sevenths);
            if (result === null)
                return { valid: false, error: `cannot harmonize "${type}" from "${args.root.trim()}"` };
            const scaleName = `${parsed.letter}${accidentalName(parsed.accidental)} ${canonical.replaceAll('_', ' ')}`;
            return {
                valid: true,
                scaleName,
                progression: result.progression,
                sevenths,
                harmony: result.harmony,
            };
        },
    });
    return { note_info, freq_to_note, chord_build, scale_generate, interval_build, interval_info, scale_harmonize };
}
//# sourceMappingURL=tools.js.map