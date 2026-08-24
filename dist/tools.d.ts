/**
 * Tool definitions for dsh-musictheory: four deterministic music-theory tools
 * exposed to every agent via defineTool. Strict JSON-schema parameter surfaces,
 * explicit result interfaces matching the inferred output types.
 *
 * @module dsh-musictheory/tools
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type NoteData } from './core.ts';
import type { ResolvedConfig } from './index.ts';
export interface ToolSet {
    note_info: ToolDefinition;
    freq_to_note: ToolDefinition;
    chord_build: ToolDefinition;
    scale_generate: ToolDefinition;
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
/** Build all four tool definitions from the resolved config. */
export declare function buildMusicTools(config: ResolvedConfig): ToolSet;
//# sourceMappingURL=tools.d.ts.map