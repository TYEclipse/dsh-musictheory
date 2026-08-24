/**
 * dsh-musictheory — deterministic music theory math for DeepSeek Harness.
 *
 * Four zero-dependency tools (pure 12-TET arithmetic):
 *   note_info       — parse a note name into MIDI / octave / pitch class / frequency + enharmonics
 *   freq_to_note    — frequency in Hz -> nearest note, cents deviation and spellings
 *   chord_build     — correctly spelled chords for 26 qualities (G# major is G# B# D#)
 *   scale_generate  — correctly spelled scales for 17 types (F# major is F# G# A# B C# D# E#)
 *
 * Agents get music theory wrong in predictable ways: wrong frequencies, wrong
 * sharp/flat counts, and enharmonic mistakes (writing G# C D# for G# major).
 * These tools replace all of it with deterministic tables and a spelling engine.
 *
 * @module dsh-musictheory
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import z from '@deepseek-ai/schemastery'
import { buildMusicTools, type ToolSet } from './tools.ts'

/** Stable Cordis plugin name (also the config key under `plugins:`). */
export const name = 'dsh-musictheory'

/** Services required before tool registration can start. */
export const inject = ['agents', 'tools']

/** Plugin configuration, resolved with defaults by the loader. */
export interface Config {
  /** Default A4 reference pitch in Hz (380-500; standard is 440). */
  a4Hz?: number
}

export const Config: z<Config> = z.object({
  a4Hz: z.number().min(380).max(500).default(440),
})

/** Config with every default resolved (all fields guaranteed). */
export interface ResolvedConfig {
  a4Hz: number
}

/** Resolve loader config into the effective runtime config. */
export function resolveConfig(config: Config): ResolvedConfig {
  return {
    a4Hz: config.a4Hz ?? 440,
  }
}

/** Register every music tool on one agent; returns the disposer. */
function decorate(agent: Agent, tools: ToolSet): () => void {
  const disposers = Object.values(tools).map((definition) => agent.ctx.tools.register(definition))
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // already disposed
      }
    }
  }
}

/** Mount the music tools on every live agent and every future one. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  const tools = buildMusicTools(resolved)
  const disposers = new Set<() => void>()

  const decorateAgent = (agent: Agent): void => {
    try {
      disposers.add(decorate(agent, tools))
    } catch (error) {
      ctx.logger('musictheory').warn(`tool registration for agent ${agent.id} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const agent of ctx.agents.list()) decorateAgent(agent)
  const off = ctx.on('agent/created', ({ agent }) => decorateAgent(agent))

  ctx.effect(() => () => {
    off()
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // already disposed
      }
    }
    disposers.clear()
  })
}
