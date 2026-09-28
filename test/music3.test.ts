/**
 * Tests for dsh-musictheory v0.3.0: `transpose` and `chord_identify`.
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every numeric and spelled expectation below is printed by that committed
 * script (sections `transpose anchors`, `chord_identify anchors`,
 * `legacy anchors`), which re-derives the values from an independent Python
 * implementation of the interval ladder, the chord table and the 12-TET
 * formula — no expectation in this file is hand-inferred. Public facts used
 * as cross-checks (A4 = 440 Hz, MIDI C4 = 60, G# up a M3 = B#, C6 <-> Am7
 * ambiguity) are re-verified by `python3 test/oracle/anchors.py --check`.
 */

import { describe, expect, it } from 'vitest'
import { parseNote } from '../src/core.ts'
import { resolveConfig } from '../src/index.ts'
import {
  buildMusicTools,
  type ChordIdentifyResult,
  type TransposeResult,
} from '../src/tools.ts'

const builtTools = buildMusicTools(resolveConfig({}))

const transpose = (args: { notes?: string[]; interval?: string; direction?: string; a4Hz?: number }): Promise<TransposeResult> =>
  (builtTools.transpose.execute as unknown as (a: { notes?: string[]; interval?: string; direction?: string; a4Hz?: number }) => Promise<TransposeResult>)(args)

const chordIdentify = (args: { notes?: string[] }): Promise<ChordIdentifyResult> =>
  (builtTools.chord_identify.execute as unknown as (a: { notes?: string[] }) => Promise<ChordIdentifyResult>)(args)

/** R7/R18 gate: a result tree carrying any undefined value is not lossless JSON. */
function assertNoUndefined(value: unknown, path = 'result'): void {
  if (value === undefined) throw new Error(`undefined value at ${path}`)
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoUndefined(v, `${path}[${i}]`))
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) assertNoUndefined(v, `${path}.${k}`)
  }
}

describe('transpose tool', () => {
  it('transposes with correct spelling, MIDI number and exact frequency', async () => {
    const r = await transpose({ notes: ['C4'], interval: 'M3' })
    expect(r.valid).toBe(true)
    expect(r.interval).toBe('M3')
    expect(r.semitones).toBe(4)
    expect(r.direction).toBe('ascending')
    expect(r.notes).toHaveLength(1)
    expect(r.notes![0]!.from).toBe('C4')
    expect(r.notes![0]!.to).toBe('E4')
    expect(r.notes![0]!.midi).toBe(64)
    expect(r.notes![0]!.frequencyHz).toBeCloseTo(329.6275569128699, 9)
    assertNoUndefined(r)
  })

  it('walks the letter ladder instead of counting semitones (G# up a M3 is B#)', async () => {
    const r = await transpose({ notes: ['G#4'], interval: 'M3' })
    expect(r.valid).toBe(true)
    expect(r.notes![0]!.to).toBe('B#4')
    expect(r.notes![0]!.midi).toBe(72)
    expect(r.notes![0]!.frequencyHz).toBeCloseTo(523.2511306011972, 9)
    assertNoUndefined(r)
  })

  it('transposes a chord downward and keeps double accidentals honest', async () => {
    const r = await transpose({ notes: ['C#4', 'E#4', 'G#4'], interval: 'm3', direction: 'descending' })
    expect(r.valid).toBe(true)
    expect(r.notes!.map((n) => n.to)).toEqual(['A#3', 'C##4', 'E#4'])
    expect(r.notes!.map((n) => n.midi)).toEqual([58, 62, 65])
    expect(r.notes!.map((n) => n.from)).toEqual(['C#4', 'E#4', 'G#4'])
    assertNoUndefined(r)
  })

  it('transposes a melody line (Bb instrument up a M2)', async () => {
    const r = await transpose({ notes: ['Bb3', 'G3', 'D4'], interval: 'M2' })
    expect(r.valid).toBe(true)
    expect(r.notes!.map((n) => n.to)).toEqual(['C4', 'A3', 'E4'])
    expect(r.notes!.map((n) => n.midi)).toEqual([60, 57, 64])
    expect(r.semitones).toBe(2)
    assertNoUndefined(r)
  })

  it('handles alias intervals, compounds and descending motion', async () => {
    const tritone = await transpose({ notes: ['Bb3'], interval: 'tritone' })
    expect(tritone.interval).toBe('A4')
    expect(tritone.notes![0]!.to).toBe('E4')
    expect(tritone.notes![0]!.midi).toBe(64)
    const down = await transpose({ notes: ['F#4'], interval: 'P4', direction: 'descending' })
    expect(down.notes![0]!.to).toBe('C#4')
    expect(down.notes![0]!.midi).toBe(61)
    expect(down.notes![0]!.frequencyHz).toBeCloseTo(277.1826309768721, 9)
    expect(down.direction).toBe('descending')
    const octave = await transpose({ notes: ['A4'], interval: 'P8', direction: 'descending' })
    expect(octave.notes![0]!.to).toBe('A3')
    expect(octave.notes![0]!.midi).toBe(57)
    expect(octave.notes![0]!.frequencyHz).toBeCloseTo(220, 9)
    const compound = await transpose({ notes: ['C4'], interval: 'P15' })
    expect(compound.notes![0]!.to).toBe('C6')
    expect(compound.notes![0]!.midi).toBe(84)
    expect(compound.notes![0]!.frequencyHz).toBeCloseTo(1046.5022612023945, 9)
    expect(compound.semitones).toBe(24)
    assertNoUndefined(tritone)
    assertNoUndefined(down)
    assertNoUndefined(compound)
  })

  it('honours a custom A4 reference', async () => {
    const r = await transpose({ notes: ['C4'], interval: 'P8', a4Hz: 415 })
    expect(r.valid).toBe(true)
    expect(r.notes![0]!.to).toBe('C5')
    expect(r.notes![0]!.frequencyHz).toBeCloseTo(493.5209527261292, 9)
    assertNoUndefined(r)
  })

  it('rejects empty and oversized note lists', async () => {
    const empty = await transpose({ notes: [] })
    expect(empty.valid).toBe(false)
    expect(empty.error).toContain('at least one')
    const tooMany = await transpose({ notes: Array.from({ length: 17 }, () => 'C4') })
    expect(tooMany.valid).toBe(false)
    expect(tooMany.error).toContain('at most 16')
  })

  it('rejects malformed notes, unspellable targets and out-of-range results', async () => {
    const bad = await transpose({ notes: ['Q4'], interval: 'M3' })
    expect(bad.valid).toBe(false)
    expect(bad.error).toContain('unrecognized note')
    const high = await transpose({ notes: ['B8'], interval: 'M9' })
    expect(high.valid).toBe(false)
    expect(high.error).toContain('cannot transpose')
    const tripleSharp = await transpose({ notes: ['C##4'], interval: 'A1' })
    expect(tripleSharp.valid).toBe(false)
    expect(tripleSharp.error).toContain('cannot transpose')
  })

  it('rejects bad a4Hz and interval names outside the schema enum', async () => {
    const a4 = await transpose({ notes: ['C4'], interval: 'M3', a4Hz: -5 })
    expect(a4.valid).toBe(false)
    expect(a4.error).toContain('a4Hz')
    await expect(transpose({ notes: ['C4'], interval: 'X9' })).rejects.toThrow()
  })

  it('renders one line per transposition', () => {
    const text = (value: unknown): string =>
      (builtTools.transpose.output.render({ notes: ['C4'] }, value as never)[0] as { text: string }).text
    expect(text({ valid: true, interval: 'M3', semitones: 4, direction: 'ascending', notes: [{ from: 'C4', to: 'E4', midi: 64, frequencyHz: 329.6275569128699 }] }))
      .toBe('M3 up (4 semitones): C4 -> E4')
    expect(text({ valid: false, error: 'boom' })).toContain('boom')
  })
})

describe('chord_identify tool', () => {
  it('identifies a root-position triad from its notes', async () => {
    const r = await chordIdentify({ notes: ['C4', 'E4', 'G4'] })
    expect(r.valid).toBe(true)
    expect(r.bass).toBe('C')
    expect(r.mode).toBe('exact')
    expect(r.pitchClasses).toEqual([0, 4, 7])
    expect(r.total).toBe(1)
    expect(r.truncated).toBe(false)
    expect(r.notes).toEqual(['C4', 'E4', 'G4'])
    expect(r.candidates).toHaveLength(1)
    expect(r.best!.symbol).toBe('Cmaj')
    expect(r.best!.quality).toBe('maj')
    expect(r.best!.root).toBe('C')
    expect(r.best!.intervals).toEqual(['1', '3', '5'])
    expect(r.best!.inversion).toBe(0)
    expect(r.best!.rootPosition).toBe(true)
    expect(r.best!.slashSymbol).toBe('Cmaj')
    expect(r.best!.score).toBe(0)
    assertNoUndefined(r)
  })

  it('recognises inversions and reports slash notation', async () => {
    const r = await chordIdentify({ notes: ['E4', 'G4', 'C5'] })
    expect(r.valid).toBe(true)
    expect(r.bass).toBe('E')
    expect(r.best!.root).toBe('C')
    expect(r.best!.symbol).toBe('Cmaj')
    expect(r.best!.slashSymbol).toBe('Cmaj/E')
    expect(r.best!.inversion).toBe(1)
    expect(r.best!.rootPosition).toBe(false)
    expect(r.best!.score).toBe(2)
    assertNoUndefined(r)
  })

  it('returns every enharmonic reading, best one first (C-E-G-A is C6 and Am7)', async () => {
    const r = await chordIdentify({ notes: ['C4', 'E4', 'G4', 'A4'] })
    expect(r.valid).toBe(true)
    expect(r.total).toBe(2)
    expect(r.candidates!.map((c) => c.slashSymbol)).toEqual(['C6', 'Am7/C'])
    expect(r.best!.symbol).toBe('C6')
    expect(r.best!.inversion).toBe(0)
    expect(r.candidates![1]!.inversion).toBe(1)
    expect(r.candidates![1]!.score).toBe(2)
    assertNoUndefined(r)
  })

  it('prefers the reading that puts the chord root in the bass (A-C-E-G is Am7)', async () => {
    const r = await chordIdentify({ notes: ['A3', 'C4', 'E4', 'G4'] })
    expect(r.valid).toBe(true)
    expect(r.bass).toBe('A')
    expect(r.candidates!.map((c) => c.slashSymbol)).toEqual(['Am7', 'C6/A'])
    expect(r.best!.score).toBe(0)
    expect(r.candidates![1]!.inversion).toBe(3)
    expect(r.candidates![1]!.score).toBe(8)
    assertNoUndefined(r)
  })

  it('lists all rotations of a symmetric chord in bass order (dim7, aug)', async () => {
    const dim7 = await chordIdentify({ notes: ['C4', 'Eb4', 'Gb4', 'Bbb4'] })
    expect(dim7.valid).toBe(true)
    expect(dim7.total).toBe(4)
    expect(dim7.candidates!.map((c) => c.slashSymbol)).toEqual(['Cdim7', 'Bbbdim7/C', 'Gbdim7/C', 'Ebdim7/C'])
    expect(dim7.candidates!.map((c) => c.inversion)).toEqual([0, 1, 2, 3])
    expect(dim7.candidates!.map((c) => c.score)).toEqual([1, 3, 5, 7])
    const aug = await chordIdentify({ notes: ['C4', 'E4', 'G#4'] })
    expect(aug.total).toBe(3)
    expect(aug.candidates!.map((c) => c.slashSymbol)).toEqual(['Caug', 'G#aug/C', 'Eaug/C'])
    expect(aug.candidates!.map((c) => c.score)).toEqual([3, 5, 7])
    assertNoUndefined(dim7)
    assertNoUndefined(aug)
  })

  it('keeps the written spelling of the root (a chord on B# stays on B#)', async () => {
    const r = await chordIdentify({ notes: ['B#4', 'D##5', 'F##5'] })
    expect(r.valid).toBe(true)
    expect(r.total).toBe(1)
    expect(r.best!.root).toBe('B#')
    expect(r.best!.symbol).toBe('B#maj')
    assertNoUndefined(r)
  })

  it('identifies a power chord and a doubled triad', async () => {
    const power = await chordIdentify({ notes: ['C4', 'G4'] })
    expect(power.best!.symbol).toBe('C5')
    expect(power.best!.quality).toBe('5')
    expect(power.best!.score).toBe(2)
    const doubled = await chordIdentify({ notes: ['C4', 'E4', 'G4', 'C5'] })
    expect(doubled.total).toBe(1)
    expect(doubled.best!.symbol).toBe('Cmaj')
    expect(doubled.notes).toEqual(['C4', 'E4', 'G4', 'C5'])
    assertNoUndefined(power)
    assertNoUndefined(doubled)
  })

  it('matches reduced voicings and names the tones that are not played', async () => {
    const r = await chordIdentify({ notes: ['C4', 'E4', 'Bb4', 'D5'] })
    expect(r.valid).toBe(true)
    expect(r.mode).toBe('incomplete')
    expect(r.total).toBe(1)
    expect(r.best!.symbol).toBe('C9')
    expect(r.best!.exact).toBe(false)
    expect(r.best!.missing).toEqual(['5'])
    expect(r.best!.score).toBe(7)
    expect(r.best!.inversion).toBe(0)
    const complete = await chordIdentify({ notes: ['D4', 'F#4', 'A4', 'C5', 'E5'] })
    expect(complete.mode).toBe('exact')
    expect(complete.best!.symbol).toBe('D9')
    expect(complete.best!.exact).toBe(true)
    expect(complete.best!.missing).toBeUndefined()
    expect(complete.best!.score).toBe(4)
    assertNoUndefined(r)
    assertNoUndefined(complete)
  })

  it('reports valid input with no known chord through an empty candidate list', async () => {
    const r = await chordIdentify({ notes: ['C4', 'Db4', 'E4'] })
    expect(r.valid).toBe(true)
    expect(r.candidates).toEqual([])
    expect(r.total).toBe(0)
    expect(r.best).toBeUndefined()
    expect(r.mode).toBe('incomplete')
    expect(r.error).toContain('no known chord quality')
    expect(r.pitchClasses).toEqual([0, 1, 4])
    assertNoUndefined(r)
  })

  it('rejects too few, too many, malformed and single-pitch-class input', async () => {
    const one = await chordIdentify({ notes: ['C4'] })
    expect(one.valid).toBe(false)
    expect(one.error).toContain('at least 2 notes')
    const many = await chordIdentify({ notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'] })
    expect(many.valid).toBe(false)
    expect(many.error).toContain('at most 8 notes')
    const bad = await chordIdentify({ notes: ['C4', 'Q4'] })
    expect(bad.valid).toBe(false)
    expect(bad.error).toContain('unrecognized note')
    const same = await chordIdentify({ notes: ['C4', 'C5'] })
    expect(same.valid).toBe(false)
    expect(same.error).toContain('distinct pitch classes')
  })

  it('renders the best reading with the other readings listed', async () => {
    const r = await chordIdentify({ notes: ['E4', 'G4', 'C5'] })
    const text = (value: unknown): string =>
      (builtTools.chord_identify.output.render({ notes: ['E4', 'G4', 'C5'] }, value as never)[0] as { text: string }).text
    expect(text(r)).toContain('Cmaj/E')
    expect(text(r)).toContain('inversion 1')
    const ambiguous = await chordIdentify({ notes: ['C4', 'E4', 'G4', 'A4'] })
    expect(text(ambiguous)).toContain('other readings: Am7/C')
  })
})

describe('identifyChord core contract', () => {
  it('returns null when every note is the same pitch class', async () => {
    const r = await chordIdentify({ notes: ['C4', 'C5', 'B#3'] })
    expect(r.valid).toBe(false)
    expect(r.error).toContain('distinct pitch classes')
  })

  it('treats input order as irrelevant but keeps the lowest note as the bass', async () => {
    const low = await chordIdentify({ notes: ['G4', 'C5', 'E4'] })
    expect(low.bass).toBe('E')
    expect(low.best!.slashSymbol).toBe('Cmaj/E')
    const high = await chordIdentify({ notes: ['C4', 'E4', 'G4'] })
    expect(high.bass).toBe('C')
    expect(parseNote('C4')!.midi).toBe(60)
  })
})
