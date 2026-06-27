/**
 * leoBrain.ts — SHIM.
 *
 * The portable conversation engine now lives in the shared package @angel-os/brain
 * (one source of truth across Merlin, Nimue, Wear). This file re-exports it so
 * Merlin's existing import paths (leoAgent, leoTools) keep working unchanged.
 *
 * Edit the engine in C:\Dev\angel-brain\src\brain.ts, then `pnpm build` there.
 */
export { runBrain } from '@angel-os/brain'
export type { Tool, ProviderConfig, BrainResult } from '@angel-os/brain'
