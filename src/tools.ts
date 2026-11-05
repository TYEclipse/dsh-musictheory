/**
 * Tool definitions for dsh-musictheory: twelve deterministic music-theory tools
 * exposed to every agent via defineTool. Strict JSON-schema parameter surfaces,
 * explicit result interfaces matching the inferred output types.
 *
 * @module dsh-musictheory/tools
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  accidentalName,
  analyzeInterval,
  analyzeProgression,
  buildChord,
  buildIntervalTarget,
  centsDeviation,
  CHORD_QUALITIES,
  DEFAULT_A4,
  enharmonicsOf,
  frequencyToMidi,
  generateScale,
  harmonizeScale,
  HARMONIZABLE_SCALES,
  identifyChord,
  identifyScale,
  INTERVAL_ALIAS_KEYS,
  INTERVAL_NAMES,
  INTERVALS,
  keySignature,
  MAX_FIFTHS,
  midiToFrequency,
  noteName,
  parseKeySpec,
  parseNote,
  resolveIntervalName,
  resolveScaleType,
  SCALE_TYPES,
  type ChordCandidate,
  type HarmonyChord,
  type KeyMode,
  type NoteData,
  type ParsedNote,
  type RomanChord,
  type ScaleCandidate,
} from './core.ts'
import type { ResolvedConfig } from './index.ts'

/** How many chord readings `chord_identify` returns before it truncates. */
export const CANDIDATE_LIMIT = 12

export interface ToolSet {
  note_info: ToolDefinition
  freq_to_note: ToolDefinition
  chord_build: ToolDefinition
  scale_generate: ToolDefinition
  interval_build: ToolDefinition
  interval_info: ToolDefinition
  scale_harmonize: ToolDefinition
  transpose: ToolDefinition
  chord_identify: ToolDefinition
  scale_identify: ToolDefinition
  key_signature: ToolDefinition
  roman_numeral: ToolDefinition
}

export interface NoteInfoResult {
  valid: boolean
  note?: string
  midi?: number
  octave?: number
  pitchClass?: number
  frequencyHz?: number
  enharmonics?: string[]
  error?: string
}

export interface FreqToNoteResult {
  valid: boolean
  note?: string
  midi?: number
  frequencyHz?: number
  centsDeviation?: number
  inMidiRange?: boolean
  enharmonics?: string[]
  error?: string
}

export interface ChordResult {
  valid: boolean
  chordName?: string
  notes?: NoteData[]
  intervals?: string[]
  error?: string
}

export interface ScaleResult {
  valid: boolean
  scaleName?: string
  notes?: NoteData[]
  degrees?: number[]
  intervals?: string[]
  error?: string
}

export interface IntervalBuildResult {
  valid: boolean
  targetNote?: string
  midi?: number
  frequencyHz?: number
  interval?: string
  semitones?: number
  direction?: 'ascending' | 'descending'
  error?: string
}

export interface IntervalInfoResult {
  valid: boolean
  name?: string
  semitones?: number
  direction?: 'ascending' | 'descending' | 'unison'
  octaves?: number
  simple?: string
  compound?: boolean
  error?: string
}

export interface ScaleHarmonyResult {
  valid: boolean
  scaleName?: string
  progression?: string
  sevenths?: boolean
  harmony?: HarmonyChord[]
  error?: string
}

/** One transposed note (input spelling -> spelled target). */
export interface TransposedNote {
  from: string
  to: string
  midi: number
  frequencyHz: number
}

export interface TransposeResult {
  valid: boolean
  interval?: string
  semitones?: number
  direction?: 'ascending' | 'descending'
  notes?: TransposedNote[]
  error?: string
}

export interface ChordIdentifyResult {
  valid: boolean
  notes?: string[]
  bass?: string
  pitchClasses?: number[]
  mode?: 'exact' | 'incomplete'
  best?: ChordCandidate
  candidates?: ChordCandidate[]
  total?: number
  truncated?: boolean
  error?: string
}

export interface ScaleIdentifyResult {
  valid: boolean
  notes?: string[]
  pitchClasses?: number[]
  mode?: 'exact' | 'contains'
  best?: ScaleCandidate
  candidates?: ScaleCandidate[]
  total?: number
  truncated?: boolean
  error?: string
}

export interface KeySignatureResult {
  valid: boolean
  key?: string
  tonic?: string
  mode?: KeyMode
  fifths?: number
  accidentals?: string[]
  accidentalCount?: number
  signature?: string
  relative?: string
  parallel?: string
  enharmonic?: string
  practical?: boolean
  notes?: string[]
  modeAssumed?: boolean
  error?: string
}

export interface RomanNumeralResult {
  valid: boolean
  key?: string
  mode?: KeyMode
  fifths?: number
  progression?: string
  chords?: RomanChord[]
  diatonicCount?: number
  modeAssumed?: boolean
  error?: string
}

/** Reject obviously bad A4 references; fall back to the configured default. */
function validA4(a4Hz: number | undefined, config: ResolvedConfig): number | null {
  if (a4Hz === undefined) return config.a4Hz
  if (!Number.isFinite(a4Hz) || a4Hz <= 0) return null
  return a4Hz
}

const A4_ERROR = `a4Hz must be a positive number (standard is ${DEFAULT_A4} Hz)`

function renderNoteInfo(value: unknown): string {
  const r = value as NoteInfoResult
  if (!r.valid) return `invalid note: ${r.error ?? 'unknown error'}`
  const enh = r.enharmonics === undefined || r.enharmonics.length === 0 ? '' : `  (also: ${r.enharmonics.join(', ')})`
  return `${r.note}: MIDI ${r.midi}, octave ${r.octave}, pitch class ${r.pitchClass}, ${r.frequencyHz} Hz${enh}`
}

function renderFreqToNote(value: unknown): string {
  const r = value as FreqToNoteResult
  if (!r.valid) return `invalid frequency: ${r.error ?? 'unknown error'}`
  const range = r.inMidiRange === true ? '' : ' (outside MIDI 0-127 range)'
  const enh = r.enharmonics === undefined || r.enharmonics.length === 0 ? '' : `  (also: ${r.enharmonics.join(', ')})`
  return `${r.frequencyHz} Hz -> ${r.note} (MIDI ${r.midi}, ${r.centsDeviation} cents)${range}${enh}`
}

function renderChord(value: unknown): string {
  const r = value as ChordResult
  if (!r.valid) return `invalid chord: ${r.error ?? 'unknown error'}`
  const notes = (r.notes ?? []).map((n) => n.name).join(' ')
  const freqs = (r.notes ?? []).map((n) => n.frequencyHz).join('/')
  return `${r.chordName}: ${notes}  (intervals ${(r.intervals ?? []).join(' ')}, ${freqs} Hz)`
}

function renderScale(value: unknown): string {
  const r = value as ScaleResult
  if (!r.valid) return `invalid scale: ${r.error ?? 'unknown error'}`
  const notes = (r.notes ?? []).map((n) => n.name).join(' ')
  const degrees = (r.degrees ?? []).join(' ')
  const intervals = (r.intervals ?? []).join(' ')
  return `${r.scaleName}: ${notes}\n  degrees: ${degrees}\n  intervals: ${intervals}`
}

function renderIntervalBuild(value: unknown): string {
  const r = value as IntervalBuildResult
  if (!r.valid) return `invalid interval: ${r.error ?? 'unknown error'}`
  const arrow = r.direction === 'descending' ? 'down' : 'up'
  return `target: ${r.targetNote} (MIDI ${r.midi}, ${r.frequencyHz} Hz) — ${r.interval} ${arrow} (${r.semitones} semitones)`
}

function renderIntervalInfo(value: unknown): string {
  const r = value as IntervalInfoResult
  if (!r.valid) return `invalid notes: ${r.error ?? 'unknown error'}`
  const compound = r.compound === true ? ` (compound: ${r.simple} + ${r.octaves} octave${r.octaves === 1 ? '' : 's'})` : ''
  return `${r.name} — ${r.semitones} semitones, ${r.direction}${compound}`
}

function renderScaleHarmony(value: unknown): string {
  const r = value as ScaleHarmonyResult
  if (!r.valid) return `invalid harmony: ${r.error ?? 'unknown error'}`
  const label = r.sevenths === true ? 'seventh chords' : 'triads'
  const lines = (r.harmony ?? []).map((h) => `  ${h.roman.padEnd(7)} ${h.notes.join(' ')} (${h.quality})`)
  return `${r.scaleName} (${label}): ${r.progression}\n${lines.join('\n')}`
}

function renderTranspose(value: unknown): string {
  const r = value as TransposeResult
  if (!r.valid) return `invalid transpose: ${r.error ?? 'unknown error'}`
  const arrow = r.direction === 'descending' ? 'down' : 'up'
  const moves = (r.notes ?? []).map((n) => `${n.from} -> ${n.to}`).join(', ')
  return `${r.interval} ${arrow} (${r.semitones} semitones): ${moves}`
}

function renderChordIdentify(value: unknown): string {
  const r = value as ChordIdentifyResult
  if (!r.valid) return `cannot identify chord: ${r.error ?? 'unknown error'}`
  const candidates = r.candidates ?? []
  if (candidates.length === 0) return `no chord identified: ${r.error ?? 'unknown error'}`
  const best = r.best!
  const missing = best.exact ? '' : ` [missing ${(best.missing ?? []).join('/')}]`
  const head = `${best.slashSymbol}  (${best.quality}${best.rootPosition ? ', root position' : `, inversion ${best.inversion}`})${missing}`
  const others = candidates.slice(1, 6).map((c) => c.slashSymbol).join(', ')
  const more = r.truncated === true ? ` (+${r.total! - candidates.length} more)` : ''
  const tail = others.length === 0 ? '' : `\n  other readings: ${others}${more}`
  return `${r.notes!.join(' ')} (bass ${r.bass}): ${head}${tail}`
}

function renderScaleIdentify(value: unknown): string {
  const r = value as ScaleIdentifyResult
  if (!r.valid) return `cannot identify scale: ${r.error ?? 'unknown error'}`
  const candidates = r.candidates ?? []
  if (candidates.length === 0) return `no scale identified: ${r.error ?? 'unknown error'}`
  const best = r.best!
  const partial = best.exact ? '' : ` [missing ${best.missing.join(' ')}]`
  const head = `${best.name}: ${best.notes.join(' ')}${partial}`
  const others = candidates.slice(1, 7).map((c) => c.name).join(', ')
  const more = r.truncated === true ? ` (+${r.total! - candidates.length} more)` : ''
  const tail = others.length === 0 ? '' : `\n  other readings: ${others}${more}`
  return `${r.notes!.join(' ')} (${r.mode}): ${head}${tail}`
}

function renderKeySignature(value: unknown): string {
  const r = value as KeySignatureResult
  if (!r.valid) return `cannot resolve key signature: ${r.error ?? 'unknown error'}`
  const accs = (r.accidentals ?? []).join(' ')
  const listing = r.accidentalCount === 0 ? r.signature! : `${r.signature} (${accs})`
  const enh = r.enharmonic === undefined ? '' : ` — same key written ${r.enharmonic}`
  const theory = r.practical === true ? '' : ' (theoretical: needs double accidentals)'
  const assumed = r.modeAssumed === true ? ' (mode defaulted to major)' : ''
  return `${r.key}${assumed}: ${listing}${theory}${enh}\n  relative ${r.relative} · parallel ${r.parallel}\n  notes: ${(r.notes ?? []).join(' ')}`
}

function renderRomanNumeral(value: unknown): string {
  const r = value as RomanNumeralResult
  if (!r.valid) return `cannot analyze progression: ${r.error ?? 'unknown error'}`
  const chords = r.chords ?? []
  const assumed = r.modeAssumed === true ? ' (mode defaulted to major)' : ''
  const head = `${r.key}${assumed}: ${chords.map((c) => c.symbol).join(' ')} -> ${r.progression}`
  const lines = chords.map((c) => {
    const mark = c.diatonic ? '✓' : c.inKey ? '◐' : '✗'
    return `  ${c.symbol.padEnd(6)} ${c.roman.padEnd(8)} ${c.notes.join(' ').padEnd(14)} ${mark} (key chord here: ${c.keyTriad})`
  })
  return `${head}\n${lines.join('\n')}\n  ${r.diatonicCount}/${chords.length} diatonic · ✓ diatonic  ◐ in key but altered  ✗ borrowed`
}

/** Build all ten tool definitions from the resolved config. */
export function buildMusicTools(config: ResolvedConfig): ToolSet {
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
      render: (_args: { note: string }, value: unknown) => [{ type: 'text', text: renderNoteInfo(value) }],
    },
    async execute(args: { note: string; a4Hz?: number }): Promise<NoteInfoResult> {
      const a4 = validA4(args.a4Hz, config)
      if (a4 === null) return { valid: false, error: A4_ERROR }
      const parsed = parseNote(args.note)
      if (parsed === null) return { valid: false, error: `unrecognized note "${args.note}" (expect e.g. "C#4", "Bb3", "F##4")` }
      return {
        valid: true,
        note: args.note.trim(),
        midi: parsed.midi,
        octave: Math.floor(parsed.midi / 12) - 1,
        pitchClass: parsed.pc,
        frequencyHz: midiToFrequency(parsed.midi, a4),
        enharmonics: enharmonicsOf(parsed.midi),
      }
    },
  })

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
      render: (_args: { frequencyHz: number }, value: unknown) => [{ type: 'text', text: renderFreqToNote(value) }],
    },
    async execute(args: { frequencyHz: number; a4Hz?: number }): Promise<FreqToNoteResult> {
      const a4 = validA4(args.a4Hz, config)
      if (a4 === null) return { valid: false, error: A4_ERROR }
      if (!Number.isFinite(args.frequencyHz) || args.frequencyHz <= 0) {
        return { valid: false, error: `frequencyHz must be a positive number (got ${args.frequencyHz})` }
      }
      const midiFloat = frequencyToMidi(args.frequencyHz, a4)
      const midi = Math.round(midiFloat)
      const inMidiRange = midi >= 0 && midi <= 127
      const result: FreqToNoteResult = {
        valid: true,
        midi,
        frequencyHz: args.frequencyHz,
        centsDeviation: centsDeviation(args.frequencyHz, midi, a4),
        inMidiRange,
      }
      if (inMidiRange) {
        const spellings = enharmonicsOf(midi)
        result.note = spellings[0]!
        result.enharmonics = spellings
      }
      return result
    },
  })

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
      render: (_args: { root: string; quality?: string }, value: unknown) => [{ type: 'text', text: renderChord(value) }],
    },
    async execute(args: { root: string; quality?: string; a4Hz?: number }): Promise<ChordResult> {
      const a4 = validA4(args.a4Hz, config)
      if (a4 === null) return { valid: false, error: A4_ERROR }
      const parsed = parseNote(args.root)
      if (parsed === null) return { valid: false, error: `unrecognized root "${args.root}"` }
      const quality = args.quality ?? 'maj'
      const chord = buildChord(parsed, quality, a4)
      if (chord === null) return { valid: false, error: `unknown chord quality "${quality}"` }
      return { valid: true, chordName: chord.chordName, notes: chord.notes, intervals: chord.intervals }
    },
  })

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
      render: (_args: { root: string; type?: string }, value: unknown) => [{ type: 'text', text: renderScale(value) }],
    },
    async execute(args: { root: string; type?: string; a4Hz?: number }): Promise<ScaleResult> {
      const a4 = validA4(args.a4Hz, config)
      if (a4 === null) return { valid: false, error: A4_ERROR }
      const parsed = parseNote(args.root)
      if (parsed === null) return { valid: false, error: `unrecognized root "${args.root}"` }
      const type = args.type ?? 'major'
      const scale = generateScale(parsed, type, a4)
      if (scale === null) return { valid: false, error: `unknown scale type "${type}"` }
      return { valid: true, scaleName: scale.scaleName, notes: scale.notes, degrees: scale.degrees, intervals: scale.intervals }
    },
  })

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
      render: (_args: { root: string; interval?: string; direction?: string }, value: unknown) => [{ type: 'text', text: renderIntervalBuild(value) }],
    },
    async execute(args: { root: string; interval?: string; direction?: string; a4Hz?: number }): Promise<IntervalBuildResult> {
      const a4 = validA4(args.a4Hz, config)
      if (a4 === null) return { valid: false, error: A4_ERROR }
      const parsed = parseNote(args.root)
      if (parsed === null) return { valid: false, error: `unrecognized root "${args.root}"` }
      const name = args.interval ?? 'P5'
      if (resolveIntervalName(name) === null) {
        return { valid: false, error: `unknown interval "${name}" (use canonical names like M3/P5/m7/A4/d5 or aliases like tritone/octave/semitone)` }
      }
      const direction = args.direction === 'descending' ? 'descending' : 'ascending'
      const target = buildIntervalTarget(parsed, name, direction)
      if (target === null) {
        return { valid: false, error: `cannot spell interval "${name}" from "${args.root.trim()}" (target may fall outside the MIDI 0-127 range)` }
      }
      return {
        valid: true,
        targetNote: target.name,
        midi: target.midi,
        frequencyHz: midiToFrequency(target.midi, a4),
        interval: target.interval,
        semitones: target.semitones,
        direction: target.direction,
      }
    },
  })

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
      render: (_args: { note1: string; note2: string }, value: unknown) => [{ type: 'text', text: renderIntervalInfo(value) }],
    },
    async execute(args: { note1: string; note2: string }): Promise<IntervalInfoResult> {
      const n1 = parseNote(args.note1)
      if (n1 === null) return { valid: false, error: `unrecognized note "${args.note1}"` }
      const n2 = parseNote(args.note2)
      if (n2 === null) return { valid: false, error: `unrecognized note "${args.note2}"` }
      const analysis = analyzeInterval(n1, n2)
      return {
        valid: true,
        name: analysis.name,
        semitones: analysis.semitones,
        direction: analysis.direction,
        octaves: analysis.octaves,
        simple: analysis.simple,
        compound: analysis.compound,
      }
    },
  })

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
      render: (_args: { root: string; type?: string; sevenths?: boolean }, value: unknown) => [{ type: 'text', text: renderScaleHarmony(value) }],
    },
    async execute(args: { root: string; type?: string; sevenths?: boolean; a4Hz?: number }): Promise<ScaleHarmonyResult> {
      const a4 = validA4(args.a4Hz, config)
      if (a4 === null) return { valid: false, error: A4_ERROR }
      const parsed = parseNote(args.root)
      if (parsed === null) return { valid: false, error: `unrecognized root "${args.root}"` }
      const type = args.type ?? 'major'
      const canonical = resolveScaleType(type)
      if (canonical === null) return { valid: false, error: `unknown scale type "${type}"` }
      if (!HARMONIZABLE_SCALES.includes(canonical)) {
        return { valid: false, error: `scale type "${type}" cannot be harmonized (only 7-note scales stack cleanly)` }
      }
      const sevenths = args.sevenths === true
      const result = harmonizeScale(parsed, canonical, sevenths)
      if (result === null) return { valid: false, error: `cannot harmonize "${type}" from "${args.root.trim()}"` }
      const scaleName = `${parsed.letter}${accidentalName(parsed.accidental)} ${canonical.replaceAll('_', ' ')}`
      return {
        valid: true,
        scaleName,
        progression: result.progression,
        sevenths,
        harmony: result.harmony,
      }
    },
  })

  const transpose = defineTool({
    name: 'transpose',
    description: 'Transpose one or more notes by a musical interval, with correct spelling; the interval and '
      + 'direction are applied through the letter ladder (C up a M3 = E, G# up a M3 = B#, Bb3 up a M2 = C4, '
      + 'F# down a P4 = C#). Use this to move a melody line or a chord into another key, or to spell '
      + 'instrument transpositions (Bb trumpet up a M2, Eb alto sax up a M6) without doing semitone '
      + 'arithmetic by hand. Every note comes back spelled, with its MIDI number and exact frequency.',
    parameters: {
      notes: { type: 'array', items: { type: 'string' }, required: true, description: '1-16 note names to transpose, e.g. ["Bb3","G3","D4"]. Octaves default to 4 when omitted.' },
      interval: { type: 'string', enum: [...INTERVAL_NAMES, ...INTERVAL_ALIAS_KEYS], description: 'Interval to transpose by: canonical ("M2", "P5", "m3", "P8", "M9") or alias ("octave", "tritone", "whole_tone"). Default "P5".' },
      direction: { type: 'string', enum: ['ascending', 'descending'], description: 'Direction of the transposition. Default ascending.' },
      a4Hz: { type: 'number', description: `A4 reference pitch in Hz (default ${DEFAULT_A4}).` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          interval: { type: 'string' },
          semitones: { type: 'number' },
          direction: { type: 'string', enum: ['ascending', 'descending'] },
          notes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                from: { type: 'string', required: true },
                to: { type: 'string', required: true },
                midi: { type: 'number', required: true },
                frequencyHz: { type: 'number', required: true },
              },
            },
          },
          error: { type: 'string' },
        },
      },
      render: (_args: { notes: string[]; interval?: string; direction?: string }, value: unknown) => [{ type: 'text', text: renderTranspose(value) }],
    },
    async execute(args: { notes?: string[]; interval?: string; direction?: string; a4Hz?: number }): Promise<TransposeResult> {
      const a4 = validA4(args.a4Hz, config)
      if (a4 === null) return { valid: false, error: A4_ERROR }
      const names = args.notes ?? []
      if (names.length === 0) return { valid: false, error: 'notes must contain at least one note name' }
      if (names.length > 16) return { valid: false, error: `notes must contain at most 16 note names (got ${names.length})` }
      const asked = args.interval ?? 'P5'
      const canonical = resolveIntervalName(asked)
      if (canonical === null) {
        return { valid: false, error: `unknown interval "${asked}" (use M3/P5/m7/A4/d5 or aliases like tritone/octave/semitone)` }
      }
      const direction = args.direction === 'descending' ? 'descending' : 'ascending'
      const moved: TransposedNote[] = []
      for (const name of names) {
        const parsed = parseNote(name)
        if (parsed === null) return { valid: false, error: `unrecognized note "${name}" (expect e.g. "C#4", "Bb3", "F##4")` }
        const target = buildIntervalTarget(parsed, canonical, direction)
        if (target === null) {
          return { valid: false, error: `cannot transpose "${noteName(parsed)}" by ${canonical} ${direction} (target outside the MIDI 0-127 range or needs more than a double accidental)` }
        }
        moved.push({ from: noteName(parsed), to: target.name, midi: target.midi, frequencyHz: midiToFrequency(target.midi, a4) })
      }
      return { valid: true, interval: canonical, semitones: INTERVALS[canonical]!.semis, direction, notes: moved }
    },
  })

  const CANDIDATE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      root: { type: 'string', required: true },
      quality: { type: 'string', required: true },
      symbol: { type: 'string', required: true },
      intervals: { type: 'array', items: { type: 'string' }, required: true },
      inversion: { type: 'number', required: true },
      bass: { type: 'string', required: true },
      slashSymbol: { type: 'string', required: true },
      rootPosition: { type: 'boolean', required: true },
      exact: { type: 'boolean', required: true },
      missing: { type: 'array', items: { type: 'string' } },
      score: { type: 'number', required: true },
    },
  } as const

  const chord_identify = defineTool({
    name: 'chord_identify',
    description: 'Identify the chord behind a set of played notes (2-8 notes), including inversions and '
      + 'enharmonic ambiguity: C E G is Cmaj, E G C (bass E) is Cmaj/E in first inversion, and C E G A '
      + 'comes back as both C6 and Am7/C because both readings are correct. Voicings that simply omit one '
      + 'or two chord tones are reported too (C E Bb D is a C9 without the fifth), flagged exact: false '
      + 'with the missing intervals. Qualities are matched by pitch-class set against '
      + 'the same 26-quality table as chord_build, so accidental spelling is preserved (a chord on B# '
      + 'stays a chord on B#, never C).'
      + ' Candidates are ranked by 2*inversion + quality weight + 3*missing tones, root position first.',
    parameters: {
      notes: { type: 'array', items: { type: 'string' }, required: true, description: '2-8 note names as played, e.g. ["E4","G4","C5"]. Order does not matter; the lowest note becomes the bass. Octaves default to 4.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          notes: { type: 'array', items: { type: 'string' } },
          bass: { type: 'string' },
          pitchClasses: { type: 'array', items: { type: 'number' } },
          mode: { type: 'string', enum: ['exact', 'incomplete'] },
          best: CANDIDATE_SCHEMA,
          candidates: { type: 'array', items: CANDIDATE_SCHEMA },
          total: { type: 'number' },
          truncated: { type: 'boolean' },
          error: { type: 'string' },
        },
      },
      render: (_args: { notes: string[] }, value: unknown) => [{ type: 'text', text: renderChordIdentify(value) }],
    },
    async execute(args: { notes?: string[] }): Promise<ChordIdentifyResult> {
      const names = args.notes ?? []
      if (names.length < 2) return { valid: false, error: `chord_identify needs at least 2 notes (got ${names.length})` }
      if (names.length > 8) return { valid: false, error: `chord_identify accepts at most 8 notes (got ${names.length})` }
      const parsed: ParsedNote[] = []
      for (const name of names) {
        const note = parseNote(name)
        if (note === null) return { valid: false, error: `unrecognized note "${name}" (expect e.g. "C#4", "Bb3", "F##4")` }
        parsed.push(note)
      }
      const identified = identifyChord(parsed, CANDIDATE_LIMIT)
      if (identified === null) {
        return { valid: false, error: 'need at least two distinct pitch classes to identify a chord' }
      }
      const pitchClasses = [...new Set(parsed.map((n) => n.pc))].sort((a, b) => a - b)
      const result: ChordIdentifyResult = {
        valid: true,
        notes: parsed.map(noteName),
        bass: identified.bass,
        pitchClasses,
        mode: identified.mode,
        candidates: identified.candidates,
        total: identified.total,
        truncated: identified.total > identified.candidates.length,
      }
      const best = identified.candidates[0]
      if (best === undefined) {
        result.error = `no known chord quality matches ${parsed.map(noteName).join(' ')} (pitch classes ${pitchClasses.join(',')})`
      } else {
        result.best = best
      }
      return result
    },
  })

  const SCALE_CANDIDATE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      root: { type: 'string', required: true },
      type: { type: 'string', required: true },
      name: { type: 'string', required: true },
      notes: { type: 'array', items: { type: 'string' }, required: true },
      missing: { type: 'array', items: { type: 'string' }, required: true },
      exact: { type: 'boolean', required: true },
      accidentalCount: { type: 'number', required: true },
      score: { type: 'number', required: true },
    },
  } as const

  const scale_identify = defineTool({
    name: 'scale_identify',
    description: 'Fit scales to a set of played notes (3-12 notes) — the inverse of scale_generate. '
      + 'C D E F G A B comes back as C major, and also as D dorian, E phrygian and the other modes of '
      + 'the same pitch classes; C D E G A is both C major pentatonic and A minor pentatonic. All '
      + 'readings are ranked by how many degrees are missing, then by how well the spelling agrees '
      + 'with the notes you wrote (C# D# E# F# G# A# B# is C# major, not the enharmonic Db major), '
      + 'then by how common the scale type is, then by whether the tonic is the lowest note played '
      + '(the bass usually names the key), then by the number of accidentals. Relative keys share '
      + 'their pitch classes, so major and its relative minor both come back; the order between them '
      + 'is cosmetic. When no scale '
      + 'contains exactly those pitch classes, `mode` is "contains": scales that include every played '
      + 'note are returned with the missing degrees listed, so a melody fragment still resolves. '
      + 'Scales that would need triple accidentals or more than seven accidentals are not reported.',
    parameters: {
      notes: { type: 'array', items: { type: 'string' }, required: true, description: '3-12 note names as played, e.g. ["C4","D4","E4","F4","G4","A4","B4"]. Order does not matter; octaves default to 4 and only distinct pitch classes are considered.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          notes: { type: 'array', items: { type: 'string' } },
          pitchClasses: { type: 'array', items: { type: 'number' } },
          mode: { type: 'string', enum: ['exact', 'contains'] },
          best: SCALE_CANDIDATE_SCHEMA,
          candidates: { type: 'array', items: SCALE_CANDIDATE_SCHEMA },
          total: { type: 'number' },
          truncated: { type: 'boolean' },
          error: { type: 'string' },
        },
      },
      render: (_args: { notes: string[] }, value: unknown) => [{ type: 'text', text: renderScaleIdentify(value) }],
    },
    async execute(args: { notes?: string[] }): Promise<ScaleIdentifyResult> {
      const names = args.notes ?? []
      if (names.length < 3) return { valid: false, error: `scale_identify needs at least 3 notes (got ${names.length})` }
      if (names.length > 12) return { valid: false, error: `scale_identify accepts at most 12 notes (got ${names.length})` }
      const parsed: ParsedNote[] = []
      for (const name of names) {
        const note = parseNote(name)
        if (note === null) return { valid: false, error: `unrecognized note "${name}" (expect e.g. "C#4", "Bb3", "F##4")` }
        parsed.push(note)
      }
      const pitchClasses = [...new Set(parsed.map((n) => n.pc))].sort((a, b) => a - b)
      if (pitchClasses.length < 3) {
        return { valid: false, error: `need at least three distinct pitch classes to name a scale (got ${pitchClasses.length})` }
      }
      const identified = identifyScale(parsed, CANDIDATE_LIMIT)
      if (identified === null) {
        return { valid: false, error: 'need at least three distinct pitch classes to name a scale' }
      }
      const result: ScaleIdentifyResult = {
        valid: true,
        notes: parsed.map(noteName),
        pitchClasses,
        mode: identified.mode,
        candidates: identified.candidates,
        total: identified.total,
        truncated: identified.total > identified.candidates.length,
      }
      const best = identified.candidates[0]
      if (best === undefined) {
        result.error = `no scale in the table fits ${parsed.map(noteName).join(' ')} (pitch classes ${pitchClasses.join(',')})`
      } else {
        result.best = best
      }
      return result
    },
  })

  const key_signature = defineTool({
    name: 'key_signature',
    description: 'Look up a key signature instead of counting sharps by hand. Ask by key name ("Eb", "F# minor") '
      + 'or by circle-of-fifths position (fifths -3 = Eb major = 3 flats, fifths 3 = A major = 3 sharps). Returns the '
      + 'accidentals in written order (F# C# G#, or Bb Eb Ab), the relative key (same signature, other mode), the '
      + 'parallel key (same tonic, other mode), the enharmonic spelling when one exists inside seven accidentals '
      + '(C# major = Db major) and the spelled scale of the key. Signatures beyond seven accidentals are reported with '
      + 'practical: false because they need double sharps — use the enharmonic field for everyday writing.',
    parameters: {
      key: { type: 'string', description: 'Key name, e.g. "Eb", "C# minor", "Bb major". A bare note name means major unless mode is given. Exactly one of key/fifths.' },
      fifths: { type: 'number', description: `Signed circle-of-fifths position: 0 = C major / A minor, 1 = G major (one sharp), -3 = Eb major (three flats). Range -${MAX_FIFTHS}..${MAX_FIFTHS}. Exactly one of key/fifths.` },
      mode: { type: 'string', enum: ['major', 'minor'], description: 'Major or minor. Used with fifths, or to resolve a bare key name ("C" is C major, mode: "minor" makes it C minor).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          key: { type: 'string' },
          tonic: { type: 'string' },
          mode: { type: 'string', enum: ['major', 'minor'] },
          fifths: { type: 'number' },
          accidentals: { type: 'array', items: { type: 'string' } },
          accidentalCount: { type: 'number' },
          signature: { type: 'string' },
          relative: { type: 'string' },
          parallel: { type: 'string' },
          enharmonic: { type: 'string' },
          practical: { type: 'boolean' },
          notes: { type: 'array', items: { type: 'string' } },
          modeAssumed: { type: 'boolean' },
          error: { type: 'string' },
        },
      },
      render: (_args: { key?: string; fifths?: number }, value: unknown) => [{ type: 'text', text: renderKeySignature(value) }],
    },
    async execute(args: { key?: string; fifths?: number; mode?: KeyMode }): Promise<KeySignatureResult> {
      if (args.key !== undefined && args.fifths !== undefined) {
        return { valid: false, error: 'give either key or fifths, not both (the key name already decides the signature)' }
      }
      if (args.key === undefined && args.fifths === undefined) {
        return { valid: false, error: 'give a key name (e.g. "Eb") or a circle-of-fifths position (e.g. -3)' }
      }
      let signature
      let modeAssumed = false
      if (args.fifths !== undefined) {
        if (!Number.isInteger(args.fifths) || Math.abs(args.fifths) > MAX_FIFTHS) {
          return { valid: false, error: `fifths must be a whole number between -${MAX_FIFTHS} and ${MAX_FIFTHS} (got ${args.fifths}); wider signatures would need triple accidentals` }
        }
        const byFifths = keySignature(args.fifths, args.mode ?? 'major')
        if (byFifths === null) {
          return { valid: false, error: `fifths ${args.fifths} is outside the spellable range -${MAX_FIFTHS}..${MAX_FIFTHS}` }
        }
        signature = byFifths
        modeAssumed = args.mode === undefined
      } else {
        const parsed = parseKeySpec(args.key!, args.mode)
        if (parsed === null) {
          return { valid: false, error: `unrecognized key "${args.key}" (expect e.g. "C major", "Eb", "F# minor")` }
        }
        signature = parsed.signature
        modeAssumed = parsed.modeAssumed
      }
      const result: KeySignatureResult = {
        valid: true,
        key: signature.key,
        tonic: signature.tonic,
        mode: signature.mode,
        fifths: signature.fifths,
        accidentals: signature.accidentals,
        accidentalCount: signature.accidentalCount,
        signature: signature.signature,
        relative: signature.relative,
        parallel: signature.parallel,
        practical: signature.practical,
        notes: signature.notes,
      }
      if (signature.enharmonic !== undefined) result.enharmonic = signature.enharmonic
      if (modeAssumed) result.modeAssumed = true
      return result
    },
  })

  const ROMAN_CHORD_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      symbol: { type: 'string', required: true },
      root: { type: 'string', required: true },
      quality: { type: 'string', required: true },
      degree: { type: 'number', required: true },
      accidental: { type: 'number', required: true },
      roman: { type: 'string', required: true },
      inKey: { type: 'boolean', required: true },
      diatonic: { type: 'boolean', required: true },
      keyTriad: { type: 'string', required: true },
      notes: { type: 'array', items: { type: 'string' }, required: true },
      bass: { type: 'string' },
      inversion: { type: 'number' },
      bassInChord: { type: 'boolean' },
    },
  } as const

  const roman_numeral = defineTool({
    name: 'roman_numeral',
    description: 'Analyze a chord progression in a key and return roman numerals: ["Am","F","C","G"] in C major '
      + 'is vi IV I V. The scale degree comes from the written letter, not the pitch class, so in C major A# is #vi '
      + 'while Bb is bVII — the same key on the piano, two different functions on paper. Each chord reports its degree, '
      + 'the chromatic alteration, the correctly spelled chord tones, whether every tone belongs to the key (inKey) and '
      + 'whether the chord equals the key\'s own chord of that size on that degree (diatonic), plus the key triad on '
      + 'that degree as a reference (degree 7 in major is vii°). Slash chords get figured-bass labels: C/E in C major '
      + 'is I6, G7/F is V42; a non-chord bass stays as a slash (C/D -> I/D with bassInChord: false). Minor keys are '
      + 'analyzed with the natural minor scale, so the raised leading tone of harmonic minor comes back as #vii.',
    parameters: {
      key: { type: 'string', required: true, description: 'Key name, e.g. "C major", "F# minor", "Eb". A bare note name means major unless mode is given.' },
      chords: { type: 'array', items: { type: 'string' }, required: true, description: '1-16 chord symbols in order, e.g. ["Am","F","C","G"] or ["Cmaj7","Am7","Dm7","G7"]. Qualities come from the chord_build table; slash chords like "C/E" are allowed.' },
      mode: { type: 'string', enum: ['major', 'minor'], description: 'Resolve a bare key name as major or minor ("C" + minor = C minor).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          key: { type: 'string' },
          mode: { type: 'string', enum: ['major', 'minor'] },
          fifths: { type: 'number' },
          progression: { type: 'string' },
          chords: { type: 'array', items: ROMAN_CHORD_SCHEMA },
          diatonicCount: { type: 'number' },
          modeAssumed: { type: 'boolean' },
          error: { type: 'string' },
        },
      },
      render: (_args: { key: string; chords: string[] }, value: unknown) => [{ type: 'text', text: renderRomanNumeral(value) }],
    },
    async execute(args: { key?: string; chords?: string[]; mode?: KeyMode }): Promise<RomanNumeralResult> {
      const spec = args.key?.trim()
      if (spec === undefined || spec === '') return { valid: false, error: 'key is required, e.g. "C major" or "A minor"' }
      const symbols = args.chords ?? []
      const analyzed = analyzeProgression(spec, symbols, args.mode)
      if (!analyzed.ok) return { valid: false, error: analyzed.error }
      const value = analyzed.value
      const parsed = parseKeySpec(spec, args.mode)
      const result: RomanNumeralResult = {
        valid: true,
        key: value.key,
        mode: value.mode,
        fifths: value.fifths,
        progression: value.progression,
        chords: value.chords,
        diatonicCount: value.diatonicCount,
      }
      if (parsed !== null && parsed.modeAssumed) result.modeAssumed = true
      return result
    },
  })

  return { note_info, freq_to_note, chord_build, scale_generate, interval_build, interval_info, scale_harmonize, transpose, chord_identify, scale_identify, key_signature, roman_numeral }
}
