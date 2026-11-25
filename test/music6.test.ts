/**
 * Tests for dsh-musictheory v0.6.0: `progression_build` (roman numerals -> chords).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every expectation below is printed by that committed script (section
 * `progression_build anchors (v0.6.0)`), which re-derives the numerals, the
 * spelled roots and chord tones, the figures and the re-analysis from an
 * independent Python implementation — no expectation here is hand-inferred.
 * `python3 test/oracle/anchors.py --check` holds the builder to the facts an
 * inverse has to satisfy: figures land on the chord tone of their index, the
 * written degree (not the pitch class) decides the root in flat keys, a
 * borrowed major V in a minor key stays V and stays flagged, the added-sixth
 * override resolves the I6 collision, and every build case round-trips back
 * through the analysis with the same numerals and the same diatonic count.
 */

import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/index.ts'
import { assertLossless } from './helpers/lossless-json.ts'
import { buildMusicTools, type ProgressionBuildResult } from '../src/tools.ts'

const builtTools = buildMusicTools(resolveConfig({}))

const build = (args: { key?: string; numerals?: string[]; qualities?: string[]; mode?: 'major' | 'minor' }): Promise<ProgressionBuildResult> =>
  (builtTools.progression_build.execute as unknown as (a: typeof args) => Promise<ProgressionBuildResult>)(args)

const render = (args: { key: string; numerals: string[] }, value: ProgressionBuildResult): string =>
  (builtTools.progression_build.output!.render as unknown as (a: unknown, v: unknown) => Array<{ text: string }>)(args, value)[0]!.text

describe('progression_build tool', () => {
  it('builds the chords of a diatonic progression', async () => {
    const r = await build({ key: 'C major', numerals: ['vi', 'IV', 'I', 'V'] })
    expect(r.valid).toBe(true)
    expect(r.key).toBe('C major')
    expect(r.mode).toBe('major')
    expect(r.fifths).toBe(0)
    expect(r.progression).toBe('vi IV I V')
    expect(r.symbols).toBe('Am F C G')
    expect(r.diatonicCount).toBe(4)
    expect(r.chords!.map((c) => c.numeral)).toEqual(['vi', 'IV', 'I', 'V'])
    expect(r.chords!.map((c) => c.symbol)).toEqual(['Am', 'F', 'C', 'G'])
    expect(r.chords!.map((c) => c.root)).toEqual(['A', 'F', 'C', 'G'])
    expect(r.chords!.map((c) => c.quality)).toEqual(['min', 'maj', 'maj', 'maj'])
    expect(r.chords!.map((c) => c.notes)).toEqual([['A', 'C', 'E'], ['F', 'A', 'C'], ['C', 'E', 'G'], ['G', 'B', 'D']])
    expect(r.chords!.every((c) => c.inKey && c.diatonic)).toBe(true)
    expect(r.chords!.map((c) => c.keyTriad)).toEqual(['vi', 'IV', 'I', 'V'])
    assertLossless(r)
  })

  it('reads figures as inversions and reports the bass', async () => {
    const r = await build({ key: 'C major', numerals: ['I6', 'V65', 'I'] })
    expect(r.valid).toBe(true)
    expect(r.symbols).toBe('C/E G7/B C')
    expect(r.progression).toBe('I6 V65 I')
    expect(r.chords![0]!.figure).toBe('6')
    expect(r.chords![0]!.inversion).toBe(1)
    expect(r.chords![0]!.bass).toBe('E')
    expect(r.chords![1]!.figure).toBe('65')
    expect(r.chords![1]!.inversion).toBe(1)
    expect(r.chords![1]!.bass).toBe('B')
    expect(r.chords![1]!.quality).toBe('7')
    expect(r.chords![2]!.figure).toBeUndefined()
    expect(r.chords![2]!.inversion).toBeUndefined()
    expect(r.diatonicCount).toBe(3)
    assertLossless(r)
  })

  it('maps 43 and 42 to the second and third inversion of a seventh chord', async () => {
    const r = await build({ key: 'C major', numerals: ['V43', 'V42'] })
    expect(r.valid).toBe(true)
    expect(r.symbols).toBe('G7/D G7/F')
    expect(r.chords!.map((c) => c.inversion)).toEqual([2, 3])
    expect(r.chords!.map((c) => c.bass)).toEqual(['D', 'F'])
    assertLossless(r)
  })

  it('spells flat keys on their own letters', async () => {
    const r = await build({ key: 'Eb major', numerals: ['I', 'IV', 'V7'] })
    expect(r.valid).toBe(true)
    expect(r.fifths).toBe(-3)
    expect(r.symbols).toBe('Eb Ab Bb7')
    expect(r.chords![0]!.notes).toEqual(['Eb', 'G', 'Bb'])
    expect(r.chords![1]!.notes).toEqual(['Ab', 'C', 'Eb'])
    expect(r.chords![2]!.notes).toEqual(['Bb', 'D', 'F', 'Ab'])
    expect(r.diatonicCount).toBe(3)
    assertLossless(r)
  })

  it('puts an accidental on the written degree, not the pitch class', async () => {
    const r = await build({ key: 'C major', numerals: ['bVII', '#iv°'] })
    expect(r.valid).toBe(true)
    expect(r.symbols).toBe('Bb F#dim')
    expect(r.chords!.map((c) => c.root)).toEqual(['Bb', 'F#'])
    expect(r.chords!.map((c) => c.quality)).toEqual(['maj', 'dim'])
    expect(r.chords!.map((c) => c.inKey)).toEqual([false, false])
    expect(r.chords!.map((c) => c.diatonic)).toEqual([false, false])
    expect(r.diatonicCount).toBe(0)
    // the key triad of each degree is still reported as the reference
    expect(r.chords!.map((c) => c.keyTriad)).toEqual(['vii°', 'IV'])
    assertLossless(r)
  })

  it('keeps a borrowed major V in a minor key as V and flags it', async () => {
    const r = await build({ key: 'A minor', numerals: ['i', 'iv', 'V7', 'i'] })
    expect(r.valid).toBe(true)
    expect(r.symbols).toBe('Am Dm E7 Am')
    expect(r.chords![2]!.roman).toBe('V7')
    expect(r.chords![2]!.notes).toEqual(['E', 'G#', 'B', 'D'])
    expect(r.chords![2]!.inKey).toBe(false)
    expect(r.chords![2]!.diatonic).toBe(false)
    expect(r.chords![2]!.keyTriad).toBe('v')
    expect(r.diatonicCount).toBe(3)
    assertLossless(r)
  })

  it('separates borrowed vii°7 from the diatonic viiø7', async () => {
    const dim = await build({ key: 'C major', numerals: ['vii°7'] })
    expect(dim.valid).toBe(true)
    expect(dim.symbols).toBe('Bdim7')
    expect(dim.chords![0]!.notes).toEqual(['B', 'D', 'F', 'Ab'])
    expect(dim.chords![0]!.inKey).toBe(false)
    expect(dim.chords![0]!.diatonic).toBe(false)

    const half = await build({ key: 'F# major', numerals: ['viiø7'] })
    expect(half.valid).toBe(true)
    expect(half.symbols).toBe('E#m7b5')
    expect(half.chords![0]!.notes).toEqual(['E#', 'G#', 'B', 'D#'])
    expect(half.chords![0]!.diatonic).toBe(true)
    assertLossless(dim)
    assertLossless(half)
  })

  it('reads the wider qualities off the numeral suffix', async () => {
    const r = await build({ key: 'C major', numerals: ['I6/9', 'IVsus4'] })
    expect(r.valid).toBe(true)
    expect(r.symbols).toBe('C6/9 Fsus4')
    expect(r.chords!.map((c) => c.quality)).toEqual(['6/9', 'sus4'])
    expect(r.chords![0]!.notes).toEqual(['C', 'E', 'G', 'A', 'D'])
    expect(r.chords![1]!.notes).toEqual(['F', 'Bb', 'C'])
    assertLossless(r)
  })

  it('resolves the I6 collision only when the quality is given', async () => {
    const inverted = await build({ key: 'C major', numerals: ['I6'] })
    expect(inverted.chords![0]!.symbol).toBe('C/E')

    const added = await build({ key: 'C major', numerals: ['I'], qualities: ['6'] })
    expect(added.valid).toBe(true)
    expect(added.symbols).toBe('C6')
    expect(added.chords![0]!.quality).toBe('6')
    expect(added.chords![0]!.notes).toEqual(['C', 'E', 'G', 'A'])
    // the numeral notation cannot tell them apart — the analysis prints I6 for both
    expect(added.chords![0]!.roman).toBe('I6')
    expect(added.chords![0]!.diatonic).toBe(false)
    assertLossless(added)
  })

  it('round-trips through roman_numeral', async () => {
    const cases: Array<{ key: string; numerals: string[] }> = [
      { key: 'C major', numerals: ['vi', 'IV', 'I', 'V'] },
      { key: 'C major', numerals: ['I6', 'V65', 'I'] },
      { key: 'Eb major', numerals: ['I', 'IV', 'V7'] },
      { key: 'A minor', numerals: ['i', 'iv', 'V7', 'i'] },
      { key: 'F# major', numerals: ['I', 'V', 'vi', 'IV'] },
    ]
    for (const item of cases) {
      const built = await build(item)
      expect(built.valid).toBe(true)
      const symbols = built.symbols!.split(' ')
      expect(symbols).toHaveLength(item.numerals.length)
      const back = await (builtTools.roman_numeral.execute as unknown as (a: unknown) => Promise<{ valid: boolean; progression?: string; diatonicCount?: number }>)({ key: item.key, chords: symbols })
      expect(back.valid).toBe(true)
      expect(back.progression).toBe(built.progression)
      expect(back.diatonicCount).toBe(built.diatonicCount)
    }
  })

  it('assumes major for a bare key name and says so', async () => {
    const r = await build({ key: 'C', numerals: ['I', 'V'] })
    expect(r.valid).toBe(true)
    expect(r.key).toBe('C major')
    expect(r.modeAssumed).toBe(true)

    const minor = await build({ key: 'C', numerals: ['i'], mode: 'minor' })
    expect(minor.valid).toBe(true)
    expect(minor.key).toBe('C minor')
    expect(minor.modeAssumed).toBeUndefined()
    assertLossless(minor)
  })

  it('rejects instead of guessing', async () => {
    const secondary = await build({ key: 'C major', numerals: ['V/V'] })
    expect(secondary.valid).toBe(false)
    expect(secondary.error).toContain('secondary dominants')

    const mixed = await build({ key: 'C major', numerals: ['vI'] })
    expect(mixed.valid).toBe(false)
    expect(mixed.error).toContain('mixed-case')

    const suffix = await build({ key: 'C major', numerals: ['Ix'] })
    expect(suffix.valid).toBe(false)
    expect(suffix.error).toContain('unrecognized suffix')

    const degree = await build({ key: 'C major', numerals: ['VIII'] })
    expect(degree.valid).toBe(false)
    expect(degree.error).toContain('unrecognized degree')

    const empty = await build({ key: 'C major', numerals: [] })
    expect(empty.valid).toBe(false)
    expect(empty.error).toContain('at least one numeral')

    const tooMany = await build({ key: 'C major', numerals: Array.from({ length: 17 }, () => 'I') })
    expect(tooMany.valid).toBe(false)
    expect(tooMany.error).toContain('at most 16')

    const key = await build({ key: 'H major', numerals: ['I'] })
    expect(key.valid).toBe(false)
    expect(key.error).toContain('unrecognized key')

    const qualityCount = await build({ key: 'C major', numerals: ['I', 'V'], qualities: ['6'] })
    expect(qualityCount.valid).toBe(false)
    expect(qualityCount.error).toContain('one entry per numeral')

    const qualityName = await build({ key: 'C major', numerals: ['I'], qualities: ['nope'] })
    expect(qualityName.valid).toBe(false)
    expect(qualityName.error).toContain('unrecognized quality')

    const figure = await build({ key: 'C major', numerals: ['I64'], qualities: ['5'] })
    expect(figure.valid).toBe(false)
    expect(figure.error).toContain('needs a 3-note chord')
  })

  it('renders one line per chord with the figure and the diatonic mark', async () => {
    const r = await build({ key: 'C major', numerals: ['I6', 'V65', 'bVII'] })
    const text = render({ key: 'C major', numerals: ['I6', 'V65', 'bVII'] }, r)
    expect(text).toContain('C major: I6 V65 bVII -> C/E G7/B Bb')
    expect(text).toContain('[6]')
    expect(text).toContain('[65]')
    expect(text).toContain('2/3 diatonic')
    expect(text).toContain('✓ diatonic')

    const bad = render({ key: 'C major', numerals: ['V/V'] }, await build({ key: 'C major', numerals: ['V/V'] }))
    expect(bad).toContain('cannot build progression')
  })

  it('is registered with the other tools', () => {
    expect(Object.keys(builtTools)).toHaveLength(13)
    expect(builtTools.progression_build.name).toBe('progression_build')
  })
})
