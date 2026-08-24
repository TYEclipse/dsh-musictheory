/**
 * Tests for dsh-musictheory core math and tool assembly.
 *
 * Anchor values come from the independent closed-form script
 * ~/.hermes/scripts/anchors-music.py (12-TET definitions), cross-checked
 * against public references (A4=440 Hz, C4=261.6255653 Hz, MIDI C4=60).
 * The spelling cases are hand-verified music theory (G# major = G# B# D#,
 * F# major = F# G# A# B C# D# E#).
 */

import { describe, expect, it } from 'vitest'
import {
  buildChord,
  centsDeviation,
  CHORDS,
  enharmonicsOf,
  generateScale,
  midiToFrequency,
  parseNote,
  resolveScaleType,
} from '../src/core.ts'
import { resolveConfig } from '../src/index.ts'
import { buildMusicTools, type ChordResult, type FreqToNoteResult, type NoteInfoResult, type ScaleResult } from '../src/tools.ts'

const A4 = 440
const builtTools = buildMusicTools(resolveConfig({}))

const noteInfo = (args: { note: string; a4Hz?: number }): Promise<NoteInfoResult> =>
  (builtTools.note_info.execute as unknown as (a: { note: string; a4Hz?: number }) => Promise<NoteInfoResult>)(args)

const freqToNote = (args: { frequencyHz: number; a4Hz?: number }): Promise<FreqToNoteResult> =>
  (builtTools.freq_to_note.execute as unknown as (a: { frequencyHz: number; a4Hz?: number }) => Promise<FreqToNoteResult>)(args)

const chordBuild = (args: { root: string; quality?: string; a4Hz?: number }): Promise<ChordResult> =>
  (builtTools.chord_build.execute as unknown as (a: { root: string; quality?: string; a4Hz?: number }) => Promise<ChordResult>)(args)

const scaleGenerate = (args: { root: string; type?: string; a4Hz?: number }): Promise<ScaleResult> =>
  (builtTools.scale_generate.execute as unknown as (a: { root: string; type?: string; a4Hz?: number }) => Promise<ScaleResult>)(args)

describe('resolveConfig', () => {
  it('applies the default A4', () => {
    expect(resolveConfig({})).toEqual({ a4Hz: 440 })
  })

  it('honours overrides', () => {
    expect(resolveConfig({ a4Hz: 442 })).toEqual({ a4Hz: 442 })
  })
})

describe('buildMusicTools', () => {
  const tools = buildMusicTools(resolveConfig({}))

  it('exposes all four tools under their canonical names', () => {
    expect(Object.keys(tools).sort()).toEqual(['chord_build', 'freq_to_note', 'note_info', 'scale_generate'])
  })
})

describe('parseNote', () => {
  it('parses naturals with the standard MIDI numbers', () => {
    expect(parseNote('C4')?.midi).toBe(60)
    expect(parseNote('A4')?.midi).toBe(69)
    expect(parseNote('c4')?.midi).toBe(60)
  })

  it('defaults the octave to 4 when omitted', () => {
    expect(parseNote('C')?.midi).toBe(60)
    expect(parseNote('Bb')?.midi).toBe(70)
  })

  it('resolves accidentals through the letter, not the pitch class alone', () => {
    expect(parseNote('B#4')?.midi).toBe(72) // same pitch as C5
    expect(parseNote('B#4')?.pc).toBe(0)
    expect(parseNote('Cb4')?.midi).toBe(59) // same pitch as B3
    expect(parseNote('Cb4')?.pc).toBe(11)
    expect(parseNote('F##4')?.midi).toBe(67)
    expect(parseNote('Gx4')?.midi).toBe(69) // x = double sharp
    expect(parseNote('Ebb4')?.midi).toBe(62)
  })

  it('rejects malformed or out-of-range spellings', () => {
    expect(parseNote('H4')).toBeNull()
    expect(parseNote('C###4')).toBeNull()
    expect(parseNote('C4b')).toBeNull()
    expect(parseNote('G#9')).toBeNull() // MIDI 128
    expect(parseNote('Cb-1')).toBeNull() // MIDI -1
    expect(parseNote('C-1')).not.toBeNull() // MIDI 0 is the floor
  })
})

describe('enharmonicsOf', () => {
  it('lists conventional alternative spellings only', () => {
    expect(enharmonicsOf(60)).toEqual(['C4', 'B#3'])
    expect(enharmonicsOf(61)).toEqual(['C#4', 'Db4'])
    expect(enharmonicsOf(59)).toEqual(['B3', 'Cb4'])
    expect(enharmonicsOf(69)).toEqual(['A4'])
    expect(enharmonicsOf(0)).toEqual(['C-1', 'B#-2'])
  })
})

describe('frequency math', () => {
  it('converts MIDI to frequency with the 12-TET formula (anchor: C4)', () => {
    expect(midiToFrequency(69, A4)).toBeCloseTo(440, 9)
    expect(midiToFrequency(60, A4)).toBeCloseTo(261.6255653005986, 9)
    expect(midiToFrequency(61, A4)).toBeCloseTo(277.1826309768721, 9)
    expect(midiToFrequency(57, A4)).toBeCloseTo(220, 9)
  })

  it('honours alternative reference pitches', () => {
    expect(midiToFrequency(60, 415)).toBeCloseTo(246.7604763630646, 9)
    expect(midiToFrequency(69, 442)).toBeCloseTo(442, 9)
    expect(midiToFrequency(60, 432)).toBeCloseTo(256.86873684058776, 9)
  })

  it('computes cents deviation (anchor: 442 Hz vs A4 @440)', () => {
    expect(centsDeviation(442, 69, A4)).toBeCloseTo(7.851415040126504, 9)
    expect(centsDeviation(261.63, 60, A4)).toBeCloseTo(0.029345134998435704, 9)
    expect(centsDeviation(440, 69, A4)).toBe(0)
  })
})

describe('chord spelling (the value: agents get these wrong)', () => {
  it('builds C major', () => {
    const chord = buildChord(parseNote('C4')!, 'maj', A4)!
    expect(chord.chordName).toBe('Cmaj')
    expect(chord.notes.map((n) => n.name)).toEqual(['C4', 'E4', 'G4'])
    expect(chord.intervals).toEqual(['1', '3', '5'])
  })

  it('spells G# major as G# B# D# (NOT G# C D#)', () => {
    const chord = buildChord(parseNote('G#4')!, 'maj', A4)!
    expect(chord.notes.map((n) => n.name)).toEqual(['G#4', 'B#4', 'D#5'])
    expect(chord.notes.map((n) => n.midi)).toEqual([68, 72, 75])
  })

  it('spells Cb major as Cb Eb Gb', () => {
    const chord = buildChord(parseNote('Cb4')!, 'maj', A4)!
    expect(chord.notes.map((n) => n.name)).toEqual(['Cb4', 'Eb4', 'Gb4'])
  })

  it('spells the double-flat seventh of Cdim7', () => {
    const chord = buildChord(parseNote('C4')!, 'dim7', A4)!
    expect(chord.notes.map((n) => n.name)).toEqual(['C4', 'Eb4', 'Gb4', 'Bbb4'])
    expect(chord.notes[3]!.midi).toBe(69)
  })

  it('spells C13 with the 13th an octave up', () => {
    const chord = buildChord(parseNote('C4')!, '13', A4)!
    expect(chord.notes.map((n) => n.name)).toEqual(['C4', 'E4', 'G4', 'Bb4', 'A5'])
    expect(chord.intervals).toEqual(['1', '3', '5', 'b7', '13'])
  })

  it('spells A m7b5', () => {
    const chord = buildChord(parseNote('A4')!, 'm7b5', A4)!
    expect(chord.notes.map((n) => n.name)).toEqual(['A4', 'C5', 'Eb5', 'G5'])
  })

  it('computes frequencies of Cmaj7 at A4=440 (anchor values)', () => {
    const chord = buildChord(parseNote('C4')!, 'maj7', A4)!
    expect(chord.notes[0]!.frequencyHz).toBeCloseTo(261.6255653005986, 9)
    expect(chord.notes[1]!.frequencyHz).toBeCloseTo(329.6275569128699, 9)
    expect(chord.notes[2]!.frequencyHz).toBeCloseTo(391.99543598174927, 9)
    expect(chord.notes[3]!.frequencyHz).toBeCloseTo(493.8833012561241, 9)
  })

  it('rejects unknown qualities at the core layer', () => {
    expect(buildChord(parseNote('C4')!, 'nonsense', A4)).toBeNull()
  })

  it('defines every advertised quality', () => {
    expect(Object.keys(CHORDS).length).toBe(26)
  })
})

describe('scale generation', () => {
  it('generates C major', () => {
    const scale = generateScale(parseNote('C4')!, 'major', A4)!
    expect(scale.notes.map((n) => n.name)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'])
    expect(scale.degrees).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('spells F# major with E# (six sharps, NOT F natural)', () => {
    const scale = generateScale(parseNote('F#4')!, 'major', A4)!
    expect(scale.notes.map((n) => n.name)).toEqual(['F#4', 'G#4', 'A#4', 'B4', 'C#5', 'D#5', 'E#5'])
  })

  it('spells Cb major with seven flats', () => {
    const scale = generateScale(parseNote('Cb4')!, 'major', A4)!
    expect(scale.notes.map((n) => n.name)).toEqual(['Cb4', 'Db4', 'Eb4', 'Fb4', 'Gb4', 'Ab4', 'Bb4'])
  })

  it('spells A harmonic minor with the raised leading tone G#', () => {
    const scale = generateScale(parseNote('A4')!, 'harmonic_minor', A4)!
    expect(scale.notes.map((n) => n.name)).toEqual(['A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G#5'])
  })

  it('spells Bb melodic minor (two flats, no sharps)', () => {
    const scale = generateScale(parseNote('Bb4')!, 'melodic_minor', A4)!
    expect(scale.notes.map((n) => n.name)).toEqual(['Bb4', 'C5', 'Db5', 'Eb5', 'F5', 'G5', 'A5'])
  })

  it('spells C blues with the flat fifth (Gb)', () => {
    const scale = generateScale(parseNote('C4')!, 'blues', A4)!
    expect(scale.notes.map((n) => n.name)).toEqual(['C4', 'Eb4', 'F4', 'Gb4', 'G4', 'Bb4'])
    expect(scale.intervals).toEqual(['1', 'b3', '4', 'b5', '5', 'b7'])
  })

  it('spells C whole tone', () => {
    const scale = generateScale(parseNote('C4')!, 'whole_tone', A4)!
    expect(scale.notes.map((n) => n.name)).toEqual(['C4', 'D4', 'E4', 'F#4', 'G#4', 'A#4'])
  })

  it('spells the chromatic scale with sharps', () => {
    const scale = generateScale(parseNote('C4')!, 'chromatic', A4)!
    expect(scale.notes.map((n) => n.name)).toEqual(
      ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4'],
    )
  })

  it('generates pentatonics', () => {
    expect(generateScale(parseNote('C4')!, 'major_pentatonic', A4)!.notes.map((n) => n.name)).toEqual(['C4', 'D4', 'E4', 'G4', 'A4'])
    expect(generateScale(parseNote('A4')!, 'minor_pentatonic', A4)!.notes.map((n) => n.name)).toEqual(['A4', 'C5', 'D5', 'E5', 'G5'])
  })

  it('resolves friendly aliases', () => {
    expect(resolveScaleType('ionian')).toBe('major')
    expect(resolveScaleType('minor')).toBe('natural_minor')
    expect(resolveScaleType('aeolian')).toBe('natural_minor')
    expect(resolveScaleType('lydian')).toBe('lydian')
    expect(resolveScaleType('nonsense')).toBeNull()
    expect(generateScale(parseNote('A4')!, 'minor', A4)!.notes.map((n) => n.name)).toEqual(['A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'])
  })

  it('wraps the octave (D dorian ends on C5)', () => {
    const scale = generateScale(parseNote('D4')!, 'dorian', A4)!
    expect(scale.notes.map((n) => n.name)).toEqual(['D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'])
  })
})

describe('tool execute layer', () => {
  it('note_info reports MIDI, octave, pitch class, frequency and enharmonics', async () => {
    const result = await noteInfo({ note: 'C#4' })
    expect(result.valid).toBe(true)
    expect(result.midi).toBe(61)
    expect(result.octave).toBe(4)
    expect(result.pitchClass).toBe(1)
    expect(result.frequencyHz).toBeCloseTo(277.1826309768721, 9)
    expect(result.enharmonics).toEqual(['C#4', 'Db4'])
  })

  it('note_info reports invalid input through valid:false (no throw)', async () => {
    const result = await noteInfo({ note: 'H4' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('unrecognized note')
  })

  it('freq_to_note maps 442 Hz to A4 +7.85 cents', async () => {
    const result = await freqToNote({ frequencyHz: 442 })
    expect(result.valid).toBe(true)
    expect(result.note).toBe('A4')
    expect(result.midi).toBe(69)
    expect(result.centsDeviation).toBeCloseTo(7.851415040126504, 9)
    expect(result.inMidiRange).toBe(true)
  })

  it('freq_to_note honours a custom reference pitch', async () => {
    const result = await freqToNote({ frequencyHz: 442, a4Hz: 442 })
    expect(result.centsDeviation).toBe(0)
  })

  it('freq_to_note flags out-of-MIDI-range frequencies', async () => {
    const result = await freqToNote({ frequencyHz: 0.5 })
    expect(result.valid).toBe(true)
    expect(result.inMidiRange).toBe(false)
  })

  it('freq_to_note rejects non-positive frequencies', async () => {
    const result = await freqToNote({ frequencyHz: -5 })
    expect(result.valid).toBe(false)
  })

  it('chord_build end-to-end', async () => {
    const result = await chordBuild({ root: 'G#', quality: 'maj' })
    expect(result.valid).toBe(true)
    expect(result.chordName).toBe('G#maj')
    expect(result.notes?.map((n) => n.name)).toEqual(['G#4', 'B#4', 'D#5'])
  })

  it('chord_build rejects an out-of-schema quality at the schema layer', async () => {
    await expect(chordBuild({ root: 'C4', quality: 'nonsense' })).rejects.toThrow()
  })

  it('scale_generate end-to-end', async () => {
    const result = await scaleGenerate({ root: 'F#', type: 'major' })
    expect(result.valid).toBe(true)
    expect(result.scaleName).toBe('F# major')
    expect(result.notes?.map((n) => n.name)).toEqual(['F#4', 'G#4', 'A#4', 'B4', 'C#5', 'D#5', 'E#5'])
    expect(result.degrees).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(result.intervals).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })

  it('scale_generate rejects an out-of-schema type at the schema layer', async () => {
    await expect(scaleGenerate({ root: 'C4', type: 'nonsense' })).rejects.toThrow()
  })
})
