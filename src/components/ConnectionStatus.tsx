'use client'
/**
 * ConnectionStatus — top-bar federation status indicator.
 *
 * "Connection: <Endeavor> · Enterprise: <Enterprise>" — a persistent readout of
 * which endeavor this Merlin is signed into and the hosting Enterprise/Diocese.
 * Resolves the Enterprise from the directory via the active endeavor's enterpriseId.
 * Renders nothing when there's no active session.
 */
import { useConnection } from '@/hooks/useConnection'

export default function ConnectionStatus() {
  const { active, directory } = useConnection()
  if (!active) return null

  const ref = directory?.endeavors.find((e) => e.slug === active.slug)
  // Resolve the hosting Enterprise: by id first; the federation directory can carry an
  // endeavor enterpriseId that isn't in the enterprises[] list, so fall back to matching
  // the host domain, then to the host domain string itself.
  const ent =
    (ref?.enterpriseId
      ? directory?.enterprises.find((x) => (x.id ?? x.domain) === ref.enterpriseId)
      : undefined) ??
    (ref?.hostedOn
      ? directory?.enterprises.find((x) => x.domain === ref.hostedOn)
      : undefined)
  const enterpriseLabel = ent?.name ?? ent?.domain ?? ref?.hostedOn

  return (
    <div className="hidden md:flex items-center gap-2 text-[10px] font-mono min-w-0 select-none">
      <span className="text-muted-foreground/30">/</span>
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <span className="size-1.5 rounded-full bg-lcars-green shrink-0" />
        <span className="uppercase tracking-widest text-muted-foreground">Connection</span>
        <span className="text-foreground truncate max-w-[180px]">{active.name}</span>
      </span>
      {enterpriseLabel ? (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span className="uppercase tracking-widest text-muted-foreground">Enterprise</span>
            <span className="text-foreground truncate max-w-[180px]">{enterpriseLabel}</span>
          </span>
        </>
      ) : null}
    </div>
  )
}
