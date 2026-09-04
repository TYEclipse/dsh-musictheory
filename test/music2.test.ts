/**
 * Tests for dsh-musictheory v0.2.0 interval engine and scale harmonization.
 *
 * Anchor values come from the independent closed-form oracle
 * ~/.hermes/scripts/anchors-music2.py (12-TET definitions + letter ladder),
 * cross-checked against hand-verified music theory:
 *   C->E = M3, C->Gb = d5, C->F# = A4, G# + M3 = B# (not C),
 *   C major triads = C Dm Em F G Am Bdim,
 *   A harmonic minor III = C E G# (augmented), G# major V = D# F## A#.
 */

import { describe, expect, it } from 'vitest'
import {
  analyzeInterval,
  buildIntervalTarget,
  harmonizeScale,
  HARMONIZABLE_SCALES,
  intervalQuality,
  parseNote,
  resolveIntervalName,
  romanFor,
} from '../src/core.ts'
import { resolveConfig } from '../src/index.ts'
import {
  buildMusicTools,
  type IntervalBuildResult,
  type IntervalInfoResult,
  type ScaleHarmonyResult,
} from '../src/tools.ts'

const builtTools = buildMusicTools(resolveConfig({}))

const intervalBuild = (args: { root: string; interval?: string; direction?: string; a4Hz?: number }): Promise<IntervalBuildResult> =>
  (builtTools.interval_build.execute as unknown as (a: { root: string; interval?: string; direction?: string; a4Hz?: number }) => Promise<IntervalBuildResult>)(args)

const intervalInfo = (args: { note1: string; note2: string }): Promise<IntervalInfoResult> =>
  (builtTools.interval_info.execute as unknown as (a: { note1: string; note2: string }) => Promise<IntervalInfoResult>)(args)

const scaleHarmonize = (args: { root: string; type?: string; sevenths?: boolean; a4Hz?: number }): Promise<ScaleHarmonyResult> =>
  (builtTools.scale_harmonize.execute as unknown as (a: { root: string; type?: string; sevenths?: boolean; a4Hz?: number }) => Promise<ScaleHarmonyResult>)(args)

/** R7/R18 gate: a result tree carrying any undefined value is not lossless JSON. */
function assertNoUndefined(value: unknown, path = 'result'): void {
  if (value === undefined) throw new Error(`undefined value at ${path}`)
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoUndefined(v, `${path}[${i}]`))
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) assertNoUndefined(v, `${path}.${k}`)
  }
}

describe('resolveIntervalName', () => {
  it('passes canonical names through', () => {
    expect(resolveIntervalName('M3')).toBe('M3')
    expect(resolveIntervalName('P15')).toBe('P15')
    expect(resolveIntervalName('d2')).toBe('d2')
  })

  it('resolves friendly aliases', () => {
    expect(resolveIntervalName('tritone')).toBe('A4')
    expect(resolveIntervalName('octave')).toBe('P8')
    expect(resolveIntervalName('semitone')).toBe('m2')
    expect(resolveIntervalName('whole_tone')).toBe('M2')
    expect(resolveIntervalName('augmented_octave')).toBe('A8')
  })

  it('rejects unknown names', () => {
    expect(resolveIntervalName('X9')).toBeNull()
    expect(resolveIntervalName('')).toBeNull()
    expect(resolveIntervalName('perfect fourth')).toBeNull()
  })
})

describe('intervalQuality', () => {
  it('classifies perfect and imperfect families', () => {
    expect(intervalQuality(5, 0)).toBe('P') // P5
    expect(intervalQuality(5, -1)).toBe('d') // d5
    expect(intervalQuality(4, 1)).toBe('A') // A4
    expect(intervalQuality(3, 0)).toBe('M') // M3
    expect(intervalQuality(3, -1)).toBe('m') // m3
    expect(intervalQuality(7, -2)).toBe('d') // d7
    expect(intervalQuality(2, -2)).toBe('d') // d2
    expect(intervalQuality(8, 1)).toBe('A') // A8
    expect(intervalQuality(1, -1)).toBe('d')
    expect(intervalQuality(3, -5)).toBe('dd') // clamps
  })
})

describe('buildIntervalTarget', () => {
  const cases: Array<[string, string, 'ascending' | 'descending', string, number]> = [
    ['C4', 'M3', 'ascending', 'E4', 64],
    ['C4', 'M3', 'descending', 'Ab3', 56],
    ['B3', 'M3', 'ascending', 'D#4', 63],
    ['C4', 'd5', 'ascending', 'Gb4', 66],
    ['C4', 'A4', 'ascending', 'F#4', 66],
    ['C4', 'P8', 'ascending', 'C5', 72],
    ['C4', 'M9', 'ascending', 'D5', 74],
    ['G#4', 'M3', 'ascending', 'B#4', 72],
    ['Cb4', 'M3', 'ascending', 'Eb4', 63],
    ['C4', 'P4', 'descending', 'G3', 55],
    ['C4', 'm7', 'ascending', 'Bb4', 70],
    ['C4', 'M10', 'ascending', 'E5', 76],
    ['A4', 'tritone', 'ascending', 'D#5', 75],
    ['C4', 'P15', 'ascending', 'C6', 84],
    ['B4', 'M2', 'ascending', 'C#5', 73],
    ['F#4', 'P5', 'ascending', 'C#5', 73],
    ['C4', 'A8', 'ascending', 'C#5', 73],
    ['Eb4', 'M6', 'ascending', 'C5', 72],
    ['C4', 'A1', 'ascending', 'C#4', 61],
    ['C4', 'd2', 'ascending', 'Dbb4', 60],
  ]

  it.each(cases)('%s %s %s -> %s (midi %i)', (root, interval, direction, expected, expectedMidi) => {
    const parsed = parseNote(root)
    expect(parsed).not.toBeNull()
    const target = buildIntervalTarget(parsed!, interval, direction)
    expect(target).not.toBeNull()
    expect(target!.name).toBe(expected)
    expect(target!.midi).toBe(expectedMidi)
    expect(target!.interval).toBe(resolveIntervalName(interval))
  })

  it('returns null for unknown intervals', () => {
    expect(buildIntervalTarget(parseNote('C4')!, 'X9')).toBeNull()
  })

  it('returns null when the target falls outside the MIDI range', () => {
    expect(buildIntervalTarget(parseNote('B8')!, 'M9')).toBeNull()
  })

  it('returns null for unspellable targets (C##4 + A1 would need a triple sharp)', () => {
    expect(buildIntervalTarget(parseNote('C##4')!, 'A1')).toBeNull()
  })
})

describe('analyzeInterval', () => {
  it('names simple ascending intervals from the letter distance', () => {
    const r = analyzeInterval(parseNote('C4')!, parseNote('E4')!)
    expect(r).toEqual({ name: 'M3', semitones: 4, direction: 'ascending', octaves: 0, simple: 'M3', compound: false })
  })

  it('keeps the interval name for descending pairs and reports the direction', () => {
    expect(analyzeInterval(parseNote('C4')!, parseNote('Ab3')!).direction).toBe('descending')
    expect(analyzeInterval(parseNote('C4')!, parseNote('Ab3')!).name).toBe('M3')
    expect(analyzeInterval(parseNote('E4')!, parseNote('C4')!).name).toBe('M3')
  })

  it('distinguishes enharmonic spellings (C->F# is A4, C->Gb is d5)', () => {
    expect(analyzeInterval(parseNote('C4')!, parseNote('F#4')!).name).toBe('A4')
    expect(analyzeInterval(parseNote('C4')!, parseNote('Gb4')!).name).toBe('d5')
    expect(analyzeInterval(parseNote('F#4')!, parseNote('C5')!).name).toBe('d5')
    expect(analyzeInterval(parseNote('C4')!, parseNote('Fb4')!).name).toBe('d4')
  })

  it('handles compound intervals with octave-reduced simple forms', () => {
    const m9 = analyzeInterval(parseNote('C4')!, parseNote('D5')!)
    expect(m9).toMatchObject({ name: 'M9', semitones: 14, octaves: 1, simple: 'M2', compound: true, direction: 'ascending' })
    const m10 = analyzeInterval(parseNote('C4')!, parseNote('E5')!)
    expect(m10).toMatchObject({ name: 'M10', semitones: 16, simple: 'M3', compound: true })
    const a8 = analyzeInterval(parseNote('C4')!, parseNote('C#5')!)
    expect(a8).toMatchObject({ name: 'A8', semitones: 13, simple: 'A1', compound: true })
  })

  it('reports P1 for identical notes', () => {
    expect(analyzeInterval(parseNote('C4')!, parseNote('C4')!)).toEqual({
      name: 'P1', semitones: 0, direction: 'unison', octaves: 0, simple: 'P1', compound: false,
    })
  })

  it('names equal-pitch different-letter pairs by letter order (C4->B#3 is a d2 down)', () => {
    const r = analyzeInterval(parseNote('C4')!, parseNote('B#3')!)
    expect(r).toMatchObject({ name: 'd2', semitones: 0, direction: 'descending', compound: false })
    expect(analyzeInterval(parseNote('C4')!, parseNote('Cb4')!).name).toBe('A1')
    expect(analyzeInterval(parseNote('C4')!, parseNote('Cb4')!).direction).toBe('descending')
  })

  it('covers sevenths and fifths in both directions', () => {
    expect(analyzeInterval(parseNote('C4')!, parseNote('B4')!).name).toBe('M7')
    expect(analyzeInterval(parseNote('C4')!, parseNote('Bb4')!).name).toBe('m7')
    expect(analyzeInterval(parseNote('A3')!, parseNote('C4')!).name).toBe('m3')
    expect(analyzeInterval(parseNote('G#4')!, parseNote('B#4')!).name).toBe('M3')
    expect(analyzeInterval(parseNote('Bb3')!, parseNote('F4')!).name).toBe('P5')
  })
})

describe('harmonizeScale (core)', () => {
  it('harmonizes C major into the canonical diatonic triads', () => {
    const result = harmonizeScale(parseNote('C4')!, 'major')!
    expect(result.progression).toBe('I ii iii IV V vi vii°')
    expect(result.harmony.map((h) => h.notes)).toEqual([
      ['C4', 'E4', 'G4'],
      ['D4', 'F4', 'A4'],
      ['E4', 'G4', 'B4'],
      ['F4', 'A4', 'C5'],
      ['G4', 'B4', 'D5'],
      ['A4', 'C5', 'E5'],
      ['B4', 'D5', 'F5'],
    ])
    expect(result.harmony.map((h) => h.quality)).toEqual([
      'major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished',
    ])
  })

  it('spells accidentals through the letter ladder (G# major V = D# F## A#)', () => {
    const result = harmonizeScale(parseNote('G#4')!, 'major')!
    expect(result.harmony[0]!.notes).toEqual(['G#4', 'B#4', 'D#5'])
    expect(result.harmony[4]!.notes).toEqual(['D#5', 'F##5', 'A#5'])
    expect(result.harmony[6]!.notes).toEqual(['F##5', 'A#5', 'C#6'])
  })

  it('finds the augmented III of harmonic minor and minor-mode triads', () => {
    const result = harmonizeScale(parseNote('A4')!, 'harmonic_minor')!
    expect(result.harmony[2]!.quality).toBe('augmented')
    expect(result.harmony[2]!.notes).toEqual(['C5', 'E5', 'G#5'])
    expect(result.harmony[2]!.roman).toBe('III+')
    expect(result.harmony[6]!.notes).toEqual(['G#5', 'B5', 'D6'])
    expect(result.harmony[0]!.quality).toBe('minor')
    expect(result.harmony[0]!.roman).toBe('i')
  })

  it('harmonizes melodic minor and dorian (vi° expected)', () => {
    const mel = harmonizeScale(parseNote('C4')!, 'melodic_minor')!
    expect(mel.harmony[2]!.quality).toBe('augmented')
    expect(mel.harmony[5]!.notes).toEqual(['A4', 'C5', 'Eb5'])
    const dor = harmonizeScale(parseNote('D4')!, 'dorian')!
    expect(dor.harmony[5]!.quality).toBe('diminished')
    expect(dor.harmony[5]!.roman).toBe('vi°')
  })

  it('stacks seventh chords when requested', () => {
    const result = harmonizeScale(parseNote('C4')!, 'major', true)!
    expect(result.progression).toBe('Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7')
    expect(result.harmony[4]!.notes).toEqual(['G4', 'B4', 'D5', 'F5'])
    expect(result.harmony[4]!.quality).toBe('dominant7')
    expect(result.harmony[6]!.notes).toEqual(['B4', 'D5', 'F5', 'A5'])
    expect(result.harmony[6]!.quality).toBe('halfDiminished7')
    expect(result.harmony[0]!.quality).toBe('major7')
    expect(result.harmony[1]!.quality).toBe('minor7')
  })

  it('returns null for non-heptatonic scales', () => {
    expect(harmonizeScale(parseNote('C4')!, 'major_pentatonic')).toBeNull()
    expect(harmonizeScale(parseNote('C4')!, 'chromatic')).toBeNull()
  })
})

describe('romanFor', () => {
  it('labels triads and seventh chords', () => {
    expect(romanFor(0, 'major', false)).toBe('I')
    expect(romanFor(1, 'minor', false)).toBe('ii')
    expect(romanFor(6, 'diminished', false)).toBe('vii°')
    expect(romanFor(2, 'augmented', false)).toBe('III+')
    expect(romanFor(4, 'dominant7', true)).toBe('V7')
    expect(romanFor(6, 'halfDiminished7', true)).toBe('viiø7')
    expect(romanFor(0, 'major7', true)).toBe('Imaj7')
    expect(romanFor(2, 'minor7', true)).toBe('iii7')
  })
})

describe('interval_build tool', () => {
  it('builds a spelled major third upward with exact frequency', async () => {
    const r = await intervalBuild({ root: 'C4', interval: 'M3' })
    expect(r.valid).toBe(true)
    expect(r.targetNote).toBe('E4')
    expect(r.midi).toBe(64)
    expect(r.frequencyHz).toBeCloseTo(329.6275569, 6)
    expect(r.direction).toBe('ascending')
    assertNoUndefined(r)
  })

  it('builds downward with a lowercase direction and alias interval', async () => {
    const r = await intervalBuild({ root: 'A4', interval: 'tritone', direction: 'descending' })
    expect(r.valid).toBe(true)
    expect(r.targetNote).toBe('Eb4')
    expect(r.midi).toBe(63)
    expect(r.interval).toBe('A4')
    expect(r.direction).toBe('descending')
    assertNoUndefined(r)
  })

  it('rejects malformed roots', async () => {
    const r = await intervalBuild({ root: 'H4', interval: 'M3' })
    expect(r.valid).toBe(false)
    expect(r.error).toContain('unrecognized root')
  })

  it('rejects results outside the MIDI range', async () => {
    const r = await intervalBuild({ root: 'B8', interval: 'M9' })
    expect(r.valid).toBe(false)
    expect(r.error).toContain('cannot spell')
  })

  it('rejects unspellable targets', async () => {
    const r = await intervalBuild({ root: 'C##4', interval: 'A1' })
    expect(r.valid).toBe(false)
  })

  it('rejects bad a4Hz', async () => {
    const r = await intervalBuild({ root: 'C4', interval: 'M3', a4Hz: -5 })
    expect(r.valid).toBe(false)
    expect(r.error).toContain('a4Hz')
  })

  it('rejects interval names outside the schema enum at the schema layer', async () => {
    await expect(intervalBuild({ root: 'C4', interval: 'X9' as string })).rejects.toThrow()
  })
})

describe('interval_info tool', () => {
  it('names a major third', async () => {
    const r = await intervalInfo({ note1: 'C4', note2: 'E4' })
    expect(r.valid).toBe(true)
    expect(r.name).toBe('M3')
    expect(r.semitones).toBe(4)
    expect(r.direction).toBe('ascending')
    expect(r.compound).toBe(false)
    assertNoUndefined(r)
  })

  it('reports descending direction and compound structure', async () => {
    const down = await intervalInfo({ note1: 'C4', note2: 'Ab3' })
    expect(down.direction).toBe('descending')
    expect(down.name).toBe('M3')
    const compound = await intervalInfo({ note1: 'C4', note2: 'D5' })
    expect(compound.name).toBe('M9')
    expect(compound.simple).toBe('M2')
    expect(compound.octaves).toBe(1)
    expect(compound.compound).toBe(true)
  })

  it('names unison and equal-pitch letter-different pairs', async () => {
    const unison = await intervalInfo({ note1: 'C4', note2: 'C4' })
    expect(unison.name).toBe('P1')
    expect(unison.direction).toBe('unison')
    const d2 = await intervalInfo({ note1: 'C4', note2: 'B#3' })
    expect(d2.name).toBe('d2')
    expect(d2.semitones).toBe(0)
    expect(d2.direction).toBe('descending')
  })

  it('rejects malformed notes', async () => {
    const r = await intervalInfo({ note1: 'C4', note2: 'Q9' })
    expect(r.valid).toBe(false)
    expect(r.error).toContain('unrecognized note')
  })
})

describe('scale_harmonize tool', () => {
  it('harmonizes C major into triads with the full progression', async () => {
    const r = await scaleHarmonize({ root: 'C4', type: 'major' })
    expect(r.valid).toBe(true)
    expect(r.scaleName).toBe('C major')
    expect(r.progression).toBe('I ii iii IV V vi vii°')
    expect(r.harmony).toHaveLength(7)
    expect(r.harmony![0]!.notes).toEqual(['C4', 'E4', 'G4'])
    expect(r.harmony![6]!.roman).toBe('vii°')
    expect(r.sevenths).toBe(false)
    assertNoUndefined(r)
  })

  it('harmonizes seventh chords on request', async () => {
    const r = await scaleHarmonize({ root: 'C4', type: 'major', sevenths: true })
    expect(r.valid).toBe(true)
    expect(r.progression).toBe('Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7')
    expect(r.harmony![4]!.notes).toEqual(['G4', 'B4', 'D5', 'F5'])
    assertNoUndefined(r)
  })

  it('resolves scale aliases and exotic spellings', async () => {
    const r = await scaleHarmonize({ root: 'G#', type: 'major' })
    expect(r.valid).toBe(true)
    expect(r.harmony![4]!.notes).toEqual(['D#5', 'F##5', 'A#5'])
    const hm = await scaleHarmonize({ root: 'A4', type: 'harmonic_minor' })
    expect(hm.harmony![2]!.quality).toBe('augmented')
    expect(hm.harmony![2]!.roman).toBe('III+')
  })

  it('rejects non-heptatonic scales with a clear reason', async () => {
    const r = await scaleHarmonize({ root: 'C4', type: 'minor_pentatonic' })
    expect(r.valid).toBe(false)
    expect(r.error).toContain('cannot be harmonized')
  })

  it('rejects scale types outside the enum at the schema layer', async () => {
    await expect(scaleHarmonize({ root: 'C4', type: 'bebop' as string })).rejects.toThrow()
  })

  it('rejects malformed roots', async () => {
    const r = await scaleHarmonize({ root: 'Q4', type: 'major' })
    expect(r.valid).toBe(false)
  })
})

describe('HARMONIZABLE_SCALES', () => {
  it('lists exactly the nine heptatonic scale types', () => {
    expect(HARMONIZABLE_SCALES.sort()).toEqual([
      'dorian', 'harmonic_minor', 'locrian', 'lydian', 'major',
      'melodic_minor', 'mixolydian', 'natural_minor', 'phrygian',
    ].sort())
  })
})
