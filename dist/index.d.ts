/**
 * dsh-musictheory — deterministic music theory math for DeepSeek Harness.
 *
 * Seven zero-dependency tools (pure 12-TET arithmetic):
 *   note_info       — parse a note name into MIDI / octave / pitch class / frequency + enharmonics
 *   freq_to_note    — frequency in Hz -> nearest note, cents deviation and spellings
 *   chord_build     — correctly spelled chords for 26 qualities (G# major is G# B# D#)
 *   scale_generate  — correctly spelled scales for 17 types (F# major is F# G# A# B C# D# E#)
 *   interval_build  — build the spelled target note of an interval up/down (G# + M3 = B#)
 *   interval_info   — name the interval between two notes (C->F# = A4, C->Gb = d5)
 *   scale_harmonize — diatonic triads/seventh chords of a scale (C major: I ii iii IV V vi vii°)
 *
 * Agents get music theory wrong in predictable ways: wrong frequencies, wrong
 * sharp/flat counts, and enharmonic mistakes (writing G# C D# for G# major).
 * These tools replace all of it with deterministic tables and a spelling engine.
 *
 * @module dsh-musictheory
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name (also the config key under `plugins:`). */
export declare const name = "dsh-musictheory";
/** Services required before tool registration can start. */
export declare const inject: string[];
/** Plugin configuration, resolved with defaults by the loader. */
export interface Config {
    /** Default A4 reference pitch in Hz (380-500; standard is 440). */
    a4Hz?: number;
}
export declare const Config: z<Config>;
/** Config with every default resolved (all fields guaranteed). */
export interface ResolvedConfig {
    a4Hz: number;
}
/** Resolve loader config into the effective runtime config. */
export declare function resolveConfig(config: Config): ResolvedConfig;
/** Mount the music tools on every live agent and every future one. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map