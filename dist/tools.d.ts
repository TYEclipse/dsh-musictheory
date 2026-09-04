/**
 * Tool definitions for dsh-musictheory: four deterministic music-theory tools
 * exposed to every agent via defineTool. Strict JSON-schema parameter surfaces,
 * explicit result interfaces matching the inferred output types.
 *
 * @module dsh-musictheory/tools
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type HarmonyChord, type NoteData } from './core.ts';
import type { ResolvedConfig } from './index.ts';
export interface ToolSet {
    note_info: ToolDefinition;
    freq_to_note: ToolDefinition;
    chord_build: ToolDefinition;
    scale_generate: ToolDefinition;
    interval_build: ToolDefinition;
    interval_info: ToolDefinition;
    scale_harmonize: ToolDefinition;
}
export interface NoteInfoResult {
    valid: boolean;
    note?: string;
    midi?: number;
    octave?: number;
    pitchClass?: number;
    frequencyHz?: number;
    enharmonics?: string[];
    error?: string;
}
export interface FreqToNoteResult {
    valid: boolean;
    note?: string;
    midi?: number;
    frequencyHz?: number;
    centsDeviation?: number;
    inMidiRange?: boolean;
    enharmonics?: string[];
    error?: string;
}
export interface ChordResult {
    valid: boolean;
    chordName?: string;
    notes?: NoteData[];
    intervals?: string[];
    error?: string;
}
export interface ScaleResult {
    valid: boolean;
    scaleName?: string;
    notes?: NoteData[];
    degrees?: number[];
    intervals?: string[];
    error?: string;
}
export interface IntervalBuildResult {
    valid: boolean;
    targetNote?: string;
    midi?: number;
    frequencyHz?: number;
    interval?: string;
    semitones?: number;
    direction?: 'ascending' | 'descending';
    error?: string;
}
export interface IntervalInfoResult {
    valid: boolean;
    name?: string;
    semitones?: number;
    direction?: 'ascending' | 'descending' | 'unison';
    octaves?: number;
    simple?: string;
    compound?: boolean;
    error?: string;
}
export interface ScaleHarmonyResult {
    valid: boolean;
    scaleName?: string;
    progression?: string;
    sevenths?: boolean;
    harmony?: HarmonyChord[];
    error?: string;
}
/** Build all seven tool definitions from the resolved config. */
export declare function buildMusicTools(config: ResolvedConfig): ToolSet;
//# sourceMappingURL=tools.d.ts.map