/**
 * Tests for dsh-musictheory v0.5.0: `key_signature` (circle of fifths) and
 * `roman_numeral` (progression analysis).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every expectation below is printed by that committed script (sections
 * `key_signature anchors` and `roman_numeral anchors`), which re-derives the
 * keys, their accidentals, the spelled scales and the roman numerals from an
 * independent Python implementation — no expectation in this file is
 * hand-inferred. `python3 test/oracle/anchors.py --check` holds the tables to
 * the published circle of fifths (15 major keys), verifies every signature's
 * accidental count/order, checks that each key's spelled scale equals the
 * definitional scale of its tonic, and analyzes the seven diatonic triads of
 * all 30 practical keys (they must all come back diatonic, in order).
 */

import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/index.ts'
import { assertLossless } from './helpers/lossless-json.ts'
import {
  buildMusicTools,
  type KeySignatureResult,
  type RomanNumeralResult,
} from '../src/tools.ts'

const builtTools = buildMusicTools(resolveConfig({}))

const keySignatureTool = (args: { key?: string; fifths?: number; mode?: 'major' | 'minor' }): Promise<KeySignatureResult> =>
  (builtTools.key_signature.execute as unknown as (a: typeof args) => Promise<KeySignatureResult>)(args)

const romanNumeral = (args: { key: string; chords: string[]; mode?: 'major' | 'minor' }): Promise<RomanNumeralResult> =>
  (builtTools.roman_numeral.execute as unknown as (a: typeof args) => Promise<RomanNumeralResult>)(args)

describe('key_signature tool', () => {
  it('resolves a flat key name: three flats, relative and parallel', async () => {
    const r = await keySignatureTool({ key: 'Eb' })
    expect(r.valid).toBe(true)
    expect(r.key).toBe('Eb major')
    expect(r.tonic).toBe('Eb')
    expect(r.mode).toBe('major')
    expect(r.fifths).toBe(-3)
    expect(r.accidentalCount).toBe(3)
    expect(r.accidentals).toEqual(['Bb', 'Eb', 'Ab'])
    expect(r.signature).toBe('3 flats')
    expect(r.relative).toBe('C minor')
    expect(r.parallel).toBe('Eb minor')
    expect(r.practical).toBe(true)
    expect(r.notes).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'])
    expect(r.enharmonic).toBeUndefined()
    expect(r.modeAssumed).toBe(true)
    assertLossless(r)
  })

  it('resolves a minor key by name and reports the natural minor scale', async () => {
    const r = await keySignatureTool({ key: 'F# minor' })
    expect(r.valid).toBe(true)
    expect(r.key).toBe('F# minor')
    expect(r.fifths).toBe(3)
    expect(r.accidentals).toEqual(['F#', 'C#', 'G#'])
    expect(r.signature).toBe('3 sharps')
    expect(r.relative).toBe('A major')
    expect(r.parallel).toBe('F# major')
    expect(r.notes).toEqual(['F#', 'G#', 'A', 'B', 'C#', 'D', 'E'])
    expect(r.modeAssumed).toBeUndefined()
    assertLossless(r)
  })

  it('answers from the circle of fifths and names the enharmonic spelling', async () => {
    const r = await keySignatureTool({ fifths: 7 })
    expect(r.valid).toBe(true)
    expect(r.key).toBe('C# major')
    expect(r.signature).toBe('7 sharps')
    expect(r.accidentals).toEqual(['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'])
    expect(r.relative).toBe('A# minor')
    expect(r.parallel).toBe('C# minor')
    expect(r.enharmonic).toBe('Db major')
    expect(r.notes).toEqual(['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'])
    expect(r.modeAssumed).toBe(true)
    assertLossless(r)
  })

  it('handles the seven-flat side and its enharmonic major key', async () => {
    const r = await keySignatureTool({ fifths: -7 })
    expect(r.key).toBe('Cb major')
    expect(r.accidentals).toEqual(['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb'])
    expect(r.relative).toBe('Ab minor')
    expect(r.enharmonic).toBe('B major')
    expect(r.notes).toEqual(['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb'])
    assertLossless(r)
  })

  it('reports C major / A minor as the zero position and keeps the mode when asked', async () => {
    const major = await keySignatureTool({ key: 'C' })
    expect(major.key).toBe('C major')
    expect(major.fifths).toBe(0)
    expect(major.signature).toBe('no accidentals')
    expect(major.accidentals).toEqual([])
    expect(major.relative).toBe('A minor')
    expect(major.parallel).toBe('C minor')

    const minor = await keySignatureTool({ key: 'C', mode: 'minor' })
    expect(minor.key).toBe('C minor')
    expect(minor.fifths).toBe(-3)
    expect(minor.relative).toBe('Eb major')
    expect(minor.parallel).toBe('C major')

    const bare = await keySignatureTool({ fifths: 0, mode: 'minor' })
    expect(bare.key).toBe('A minor')
    expect(bare.notes).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    assertLossless(major)
    assertLossless(minor)
    assertLossless(bare)
  })

  it('flags signatures that need double accidentals as not practical', async () => {
    const r = await keySignatureTool({ fifths: 8 })
    expect(r.key).toBe('G# major')
    expect(r.accidentalCount).toBe(8)
    expect(r.practical).toBe(false)
    expect(r.accidentals).toEqual(['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#', 'F##'])
    expect(r.enharmonic).toBe('Ab major')
    expect(r.notes).toEqual(['G#', 'A#', 'B#', 'C#', 'D#', 'E#', 'F##'])
    assertLossless(r)
  })

  it('resolves a theoretical minor key with ten flats', async () => {
    const r = await keySignatureTool({ fifths: -10, mode: 'minor' })
    expect(r.key).toBe('Cb minor')
    expect(r.signature).toBe('10 flats')
    expect(r.accidentals).toEqual(['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb', 'Bbb', 'Ebb', 'Abb'])
    expect(r.relative).toBe('Ebb major')
    expect(r.enharmonic).toBe('B minor')
    expect(r.practical).toBe(false)
    expect(r.notes).toEqual(['Cb', 'Db', 'Ebb', 'Fb', 'Gb', 'Abb', 'Bbb'])
    assertLossless(r)
  })

  it('rejects conflicting or unspellable input instead of guessing', async () => {
    const both = await keySignatureTool({ key: 'Eb', fifths: -3 })
    expect(both.valid).toBe(false)
    expect(both.error).toContain('not both')

    const wide = await keySignatureTool({ fifths: 12 })
    expect(wide.valid).toBe(false)
    expect(wide.error).toContain('between -11 and 11')

    const junk = await keySignatureTool({ key: 'H major' })
    expect(junk.valid).toBe(false)
    expect(junk.error).toContain('unrecognized key')

    const none = await keySignatureTool({})
    expect(none.valid).toBe(false)
    expect(none.error).toContain('give a key name')

    const decimal = await keySignatureTool({ fifths: 1.5 })
    expect(decimal.valid).toBe(false)
    assertLossless(both)
    assertLossless(wide)
  })
})

describe('roman_numeral tool', () => {
  it('analyzes the I-vi-IV-V family in C major', async () => {
    const r = await romanNumeral({ key: 'C major', chords: ['Am', 'F', 'C', 'G'] })
    expect(r.valid).toBe(true)
    expect(r.key).toBe('C major')
    expect(r.fifths).toBe(0)
    expect(r.progression).toBe('vi IV I V')
    expect(r.diatonicCount).toBe(4)
    expect(r.chords).toHaveLength(4)
    const [first, , third] = r.chords!
    expect(first!.symbol).toBe('Am')
    expect(first!.root).toBe('A')
    expect(first!.quality).toBe('min')
    expect(first!.degree).toBe(6)
    expect(first!.accidental).toBe(0)
    expect(first!.roman).toBe('vi')
    expect(first!.inKey).toBe(true)
    expect(first!.diatonic).toBe(true)
    expect(first!.keyTriad).toBe('vi')
    expect(first!.notes).toEqual(['A', 'C', 'E'])
    expect(third!.roman).toBe('I')
    expect(third!.notes).toEqual(['C', 'E', 'G'])
    assertLossless(r)
  })

  it('labels all seven diatonic triads of C major', async () => {
    const r = await romanNumeral({ key: 'C major', chords: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'] })
    expect(r.progression).toBe('I ii iii IV V vi vii°')
    expect(r.diatonicCount).toBe(7)
    expect(r.chords!.map((c) => c.keyTriad)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
    expect(r.chords![6]!.notes).toEqual(['B', 'D', 'F'])
    assertLossless(r)
  })

  it('keeps a borrowed major V in a minor key as V but flags it out of key', async () => {
    const r = await romanNumeral({ key: 'A minor', chords: ['Am', 'Dm', 'E', 'Am'] })
    expect(r.progression).toBe('i iv V i')
    expect(r.diatonicCount).toBe(3)
    const dominant = r.chords![2]!
    expect(dominant.roman).toBe('V')
    expect(dominant.quality).toBe('maj')
    expect(dominant.inKey).toBe(false)
    expect(dominant.diatonic).toBe(false)
    expect(dominant.keyTriad).toBe('v')
    expect(dominant.notes).toEqual(['E', 'G#', 'B'])
    assertLossless(r)
  })

  it('treats the natural-minor v as diatonic', async () => {
    const r = await romanNumeral({ key: 'A minor', chords: ['Am', 'Dm', 'Em', 'Am'] })
    expect(r.progression).toBe('i iv v i')
    expect(r.diatonicCount).toBe(4)
    expect(r.chords![2]!.notes).toEqual(['E', 'G', 'B'])
    assertLossless(r)
  })

  it('lets the written letter decide the degree (A# is #VI, Bb is bVII)', async () => {
    const r = await romanNumeral({ key: 'C major', chords: ['A#', 'Bb'] })
    expect(r.progression).toBe('#VI bVII')
    expect(r.diatonicCount).toBe(0)
    const [sharp, flat] = r.chords!
    expect(sharp!.degree).toBe(6)
    expect(sharp!.accidental).toBe(1)
    expect(sharp!.roman).toBe('#VI')
    expect(sharp!.inKey).toBe(false)
    expect(sharp!.notes).toEqual(['A#', 'C##', 'E#'])
    expect(flat!.degree).toBe(7)
    expect(flat!.accidental).toBe(-1)
    expect(flat!.roman).toBe('bVII')
    expect(flat!.notes).toEqual(['Bb', 'D', 'F'])
    assertLossless(r)
  })

  it('gives figured-bass labels to slash chords and keeps a non-chord bass as a slash', async () => {
    const r = await romanNumeral({ key: 'C major', chords: ['C/E', 'G7/F', 'C/D'] })
    expect(r.progression).toBe('I6 V42 I/D')
    const [first, second, third] = r.chords!
    expect(first!.roman).toBe('I6')
    expect(first!.bass).toBe('E')
    expect(first!.inversion).toBe(1)
    expect(first!.bassInChord).toBe(true)
    expect(second!.roman).toBe('V42')
    expect(second!.bass).toBe('F')
    expect(second!.inversion).toBe(3)
    expect(second!.notes).toEqual(['G', 'B', 'D', 'F'])
    expect(third!.roman).toBe('I/D')
    expect(third!.bass).toBe('D')
    expect(third!.bassInChord).toBe(false)
    assertLossless(r)
  })

  it('spells every chord tone on its own letter in sharp keys', async () => {
    const r = await romanNumeral({ key: 'F# major', chords: ['F#', 'B', 'C#'] })
    expect(r.key).toBe('F# major')
    expect(r.fifths).toBe(6)
    expect(r.progression).toBe('I IV V')
    expect(r.chords!.map((c) => c.notes)).toEqual([
      ['F#', 'A#', 'C#'],
      ['B', 'D#', 'F#'],
      ['C#', 'E#', 'G#'],
    ])
    expect(r.diatonicCount).toBe(3)
    assertLossless(r)
  })

  it('marks a minor iv borrowed in a major key without dropping the key triad', async () => {
    const r = await romanNumeral({ key: 'E major', chords: ['Am'] })
    expect(r.progression).toBe('iv')
    expect(r.diatonicCount).toBe(0)
    expect(r.chords![0]!.keyTriad).toBe('IV')
    expect(r.chords![0]!.inKey).toBe(false)
    expect(r.chords![0]!.notes).toEqual(['A', 'C', 'E'])
    assertLossless(r)
  })

  it('keeps seventh chords and their qualities in the numeral', async () => {
    const r = await romanNumeral({ key: 'C major', chords: ['Cmaj7', 'Am7', 'Dm7', 'G7'] })
    expect(r.progression).toBe('Imaj7 vi7 ii7 V7')
    expect(r.diatonicCount).toBe(4)
    expect(r.chords!.map((c) => c.quality)).toEqual(['maj7', 'm7', 'm7', '7'])
    expect(r.chords!.map((c) => c.notes)).toEqual([
      ['C', 'E', 'G', 'B'],
      ['A', 'C', 'E', 'G'],
      ['D', 'F', 'A', 'C'],
      ['G', 'B', 'D', 'F'],
    ])
    assertLossless(r)
  })

  it('rejects unknown chords, unknown keys and empty progressions', async () => {
    const badChord = await romanNumeral({ key: 'C major', chords: ['Cxyz'] })
    expect(badChord.valid).toBe(false)
    expect(badChord.error).toContain('unrecognized chord symbol')

    const badKey = await romanNumeral({ key: 'H major', chords: ['C'] })
    expect(badKey.valid).toBe(false)
    expect(badKey.error).toContain('unrecognized key')

    const empty = await romanNumeral({ key: 'C major', chords: [] })
    expect(empty.valid).toBe(false)
    expect(empty.error).toContain('at least one chord')

    const tooMany = await romanNumeral({ key: 'C major', chords: Array.from({ length: 17 }, () => 'C') })
    expect(tooMany.valid).toBe(false)
    expect(tooMany.error).toContain('at most 16')

    const noKey = await romanNumeral({ key: '', chords: ['C'] })
    expect(noKey.valid).toBe(false)
    expect(noKey.error).toContain('key is required')
    assertLossless(badChord)
    assertLossless(tooMany)
  })

  it('accepts compound qualities that contain a slash', async () => {
    const r = await romanNumeral({ key: 'C major', chords: ['C6/9'] })
    expect(r.valid).toBe(true)
    expect(r.progression).toBe('I6/9')
    expect(r.chords![0]!.quality).toBe('6/9')
    expect(r.chords![0]!.notes).toEqual(['C', 'E', 'G', 'A', 'D'])
    expect(r.chords![0]!.bass).toBeUndefined()
    assertLossless(r)
  })
})
