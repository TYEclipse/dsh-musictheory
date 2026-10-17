/**
 * Tests for dsh-musictheory v0.4.0: `scale_identify` (the inverse of scale_generate).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every expectation below is printed by that committed script (section
 * `scale_identify anchors`), which re-derives the scale tables, the spelling
 * of every degree and the ranking from an independent Python implementation —
 * no expectation in this file is hand-inferred. `python3 test/oracle/anchors.py
 * --check` re-verifies the public facts and the structural invariants: every
 * exact reading carries exactly the played pitch classes, every "contains"
 * reading includes all of them, and relative keys share one pitch-class set.
 */

import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/index.ts'
import { assertLossless } from './helpers/lossless-json.ts'
import { buildMusicTools, type ScaleIdentifyResult } from '../src/tools.ts'

const builtTools = buildMusicTools(resolveConfig({}))

const scaleIdentify = (args: { notes?: string[] }): Promise<ScaleIdentifyResult> =>
  (builtTools.scale_identify.execute as unknown as (a: { notes?: string[] }) => Promise<ScaleIdentifyResult>)(args)

const C_MAJOR_SET = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']

describe('scale_identify tool', () => {
  it('identifies the C major collection and reports every mode of it', async () => {
    const r = await scaleIdentify({ notes: C_MAJOR_SET })
    expect(r.valid).toBe(true)
    expect(r.mode).toBe('exact')
    expect(r.total).toBe(7)
    expect(r.truncated).toBe(false)
    const best = r.best!
    expect(best.name).toBe('C major')
    expect(best.root).toBe('C')
    expect(best.type).toBe('major')
    expect(best.notes).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
    expect(best.missing).toEqual([])
    expect(best.exact).toBe(true)
    expect(best.accidentalCount).toBe(0)
    expect(best.score).toBe(0)
    expect(r.pitchClasses).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(r.candidates!.map((c) => c.name)).toEqual([
      'C major',
      'A natural minor',
      'D dorian',
      'E phrygian',
      'F lydian',
      'G mixolydian',
      'B locrian',
    ])
    assertLossless(r)
  })

  it('keeps the written spelling instead of picking the enharmonic key (C# major, never Db major)', async () => {
    const r = await scaleIdentify({ notes: ['C#4', 'D#4', 'E#4', 'F#4', 'G#4', 'A#4', 'B#4'] })
    expect(r.valid).toBe(true)
    expect(r.mode).toBe('exact')
    const best = r.best!
    expect(best.name).toBe('C# major')
    expect(best.notes).toEqual(['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'])
    expect(best.accidentalCount).toBe(7)
    // The enharmonically identical Db major (5 flats) must not win, and every
    // sharp-spelled reading stays sharp-spelled.
    expect(r.candidates!.some((c) => c.root === 'Db')).toBe(false)
    expect(r.candidates!.every((c) => c.notes.every((n) => !n.includes('b')))).toBe(true)
    expect(r.candidates!.map((c) => c.name).slice(0, 2)).toEqual(['C# major', 'A# natural minor'])
    assertLossless(r)
  })

  it('reads flat keys as flats (Bb major needs two flats)', async () => {
    const r = await scaleIdentify({ notes: ['Bb3', 'C4', 'D4', 'Eb4', 'F4', 'G4', 'A4'] })
    expect(r.valid).toBe(true)
    const best = r.best!
    expect(best.name).toBe('Bb major')
    expect(best.notes).toEqual(['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'])
    expect(best.accidentalCount).toBe(2)
    expect(r.total).toBe(7)
    assertLossless(r)
  })

  it('reports the pentatonic ambiguity (C major pentatonic == A minor pentatonic)', async () => {
    const r = await scaleIdentify({ notes: ['C4', 'D4', 'E4', 'G4', 'A4'] })
    expect(r.valid).toBe(true)
    expect(r.mode).toBe('exact')
    expect(r.total).toBe(2)
    expect(r.candidates!.map((c) => c.name)).toEqual(['C major pentatonic', 'A minor pentatonic'])
    expect(r.best!.notes).toEqual(['C', 'D', 'E', 'G', 'A'])
    assertLossless(r)
  })

  it('is unique for harmonic minor and names it without help', async () => {
    const r = await scaleIdentify({ notes: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G#4'] })
    expect(r.valid).toBe(true)
    expect(r.mode).toBe('exact')
    expect(r.total).toBe(1)
    expect(r.best!.name).toBe('A harmonic minor')
    expect(r.best!.notes).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#'])
    expect(r.best!.accidentalCount).toBe(1)
    assertLossless(r)
  })

  it('identifies the blues scale, whose b5 and 5 share one letter', async () => {
    const r = await scaleIdentify({ notes: ['C4', 'Eb4', 'F4', 'Gb4', 'G4', 'Bb4'] })
    expect(r.valid).toBe(true)
    expect(r.total).toBe(1)
    expect(r.best!.name).toBe('C blues')
    expect(r.best!.notes).toEqual(['C', 'Eb', 'F', 'Gb', 'G', 'Bb'])
    expect(r.best!.accidentalCount).toBe(3)
    assertLossless(r)
  })

  it('identifies the whole-tone collection with all six possible tonics', async () => {
    const r = await scaleIdentify({ notes: ['C4', 'D4', 'E4', 'F#4', 'G#4', 'A#4'] })
    expect(r.valid).toBe(true)
    expect(r.total).toBe(6)
    expect(r.best!.name).toBe('C whole tone')
    expect(r.best!.notes).toEqual(['C', 'D', 'E', 'F#', 'G#', 'A#'])
    expect(r.best!.accidentalCount).toBe(3)
    assertLossless(r)
  })

  it('identifies a twelve-tone collection as chromatic', async () => {
    const r = await scaleIdentify({ notes: ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4'] })
    expect(r.valid).toBe(true)
    expect(r.mode).toBe('exact')
    expect(r.best!.name).toBe('C chromatic')
    expect(r.best!.notes).toHaveLength(12)
    expect(r.best!.accidentalCount).toBe(5)
    expect(r.total).toBe(10)
    assertLossless(r)
  })

  it('falls back to "contains" for a triad and names the missing degrees', async () => {
    const r = await scaleIdentify({ notes: ['C4', 'E4', 'G4'] })
    expect(r.valid).toBe(true)
    expect(r.mode).toBe('contains')
    const best = r.best!
    expect(best.name).toBe('C major pentatonic')
    expect(best.exact).toBe(false)
    expect(best.missing).toEqual(['D', 'A'])
    expect(best.score).toBe(6)
    expect(r.total).toBe(14)
    expect(r.candidates).toHaveLength(12)
    expect(r.truncated).toBe(true)
    assertLossless(r)
  })

  it('ignores octaves and duplicate notes (the pitch-class set is what matters)', async () => {
    const a = await scaleIdentify({ notes: ['C4', 'E4', 'G4'] })
    const b = await scaleIdentify({ notes: ['C5', 'C4', 'G4', 'E4'] })
    expect(b.valid).toBe(true)
    expect(b.candidates!.map((c) => c.name)).toEqual(a.candidates!.map((c) => c.name))
    expect(b.pitchClasses).toEqual([0, 4, 7])
    assertLossless(b)
  })

  it('lets the bass break ties between relative keys', async () => {
    const cBass = await scaleIdentify({ notes: ['C4', 'E4', 'G4'] })
    const gBass = await scaleIdentify({ notes: ['G3', 'C4', 'E4'] })
    // Same pitch classes, same readings — only the order changes.
    expect([...gBass.candidates!].map((c) => c.name).sort())
      .toEqual([...cBass.candidates!].map((c) => c.name).sort())
    expect(gBass.candidates![1]!.name).toBe('G major')
    assertLossless(gBass)
  })

  it('rejects inputs that cannot name a scale', async () => {
    const tooFew = await scaleIdentify({ notes: ['C4', 'E4'] })
    expect(tooFew.valid).toBe(false)
    expect(tooFew.error).toContain('at least 3 notes')

    const tooMany = await scaleIdentify({ notes: Array.from({ length: 13 }, () => 'C4') })
    expect(tooMany.valid).toBe(false)
    expect(tooMany.error).toContain('at most 12 notes')

    const typo = await scaleIdentify({ notes: ['C4', 'E4', 'H4'] })
    expect(typo.valid).toBe(false)
    expect(typo.error).toContain('unrecognized note')

    const twoPitchClasses = await scaleIdentify({ notes: ['C4', 'C5', 'E4'] })
    expect(twoPitchClasses.valid).toBe(false)
    expect(twoPitchClasses.error).toContain('three distinct pitch classes')
  })

  it('is registered with the other tools and renders a readable answer', () => {
    const names = Object.keys(builtTools)
    expect(names).toHaveLength(10)
    expect(names).toContain('scale_identify')
    expect(builtTools.scale_identify.name).toBe('scale_identify')
  })
})
