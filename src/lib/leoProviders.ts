/**
 * leoProviders.ts — SHIM.
 *
 * The provider adapters + neutral message format now live in the shared portable
 * package @angel-os/brain (one source of truth across Merlin, Nimue, Wear). This
 * file re-exports them so Merlin's existing import paths keep working unchanged.
 *
 * Edit providers in C:\Dev\angel-brain\src\providers.ts, then `pnpm build` there.
 */
export {
  resolveProvider,
  pickProvider,
  callModel,
} from '@angel-os/brain'
export type {
  NeutralMsg,
  ToolDef,
  ToolCall,
  ToolResult,
  ModelReply,
  Provider,
  ProviderPick,
  ProviderResolveInput,
} from '@angel-os/brain'
