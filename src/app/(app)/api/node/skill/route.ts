import { NextResponse } from 'next/server'
import { listSharedMedia, listBrowsableFiles } from '@/lib/nodeSkills'
import { captureFrame } from '@/lib/camera'
import { submitSnapshot } from '@/lib/node-bus'
import { runAgent } from '@/lib/leoAgent'
import { appendLog } from '@/lib/store'

const KINDS = ['list_media', 'list_files', 'snap_camera', 'chat'] as const

const configured = process.env.NODE_SKILL_KEY || process.env.NODE_REGISTER_KEY || ''

export async function POST(req: Request) {
  if (!configured) {
    return NextResponse.json({ error: 'node skill surface disabled (no NODE_SKILL_KEY)' }, { status: 403 })
  }

  let body: { skill?: string; args?: Record<string, unknown>; key?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if ((body.key || req.headers.get('x-node-key') || '') !== configured) {
    return NextResponse.json({ error: 'invalid or missing node key' }, { status: 403 })
  }

  const skill = (body.skill || '').trim()
  const args = body.args || {}

  const startedAt = Date.now()

  try {
    switch (skill) {
      case 'list_media': {
        const result = listSharedMedia({
          query: typeof args.query === 'string' ? args.query : undefined,
          dir: typeof args.dir === 'string' ? args.dir : undefined,
        })
        return NextResponse.json({ skill, elapsedMs: Date.now() - startedAt, ...result },
          { status: result.ok ? 200 : 400 })
      }

      case 'list_files': {
        const result = listBrowsableFiles({
          query: typeof args.query === 'string' ? args.query : undefined,
          dir: typeof args.dir === 'string' ? args.dir : undefined,
        })
        return NextResponse.json({ skill, elapsedMs: Date.now() - startedAt, ...result },
          { status: result.ok ? 200 : 400 })
      }

      case 'snap_camera': {
        const device = typeof args.device === 'string' ? args.device : undefined
        const window = typeof args.window === 'string' ? args.window : undefined
        const snap = await captureFrame({ device, window })
        if (!snap.ok || !snap.buffer) {
          return NextResponse.json({ skill, error: snap.error || 'capture failed', elapsedMs: Date.now() - startedAt },
            { status: 500 })
        }
        const up = await submitSnapshot(snap.buffer, snap.filename!, snap.mimetype!, `Snapshot from ${snap.device}`)
        if (!up.ok) {
          return NextResponse.json({ skill, error: up.error || 'submit failed', elapsedMs: Date.now() - startedAt },
            { status: 500 })
        }
        appendLog({ type: 'angels', source: 'node-skill', message: `snap_camera from "${snap.device}" → ${up.url}` })
        return NextResponse.json({
          skill,
          ok: true,
          device: snap.device,
          url: up.url,
          elapsedMs: Date.now() - startedAt,
        })
      }

      case 'chat': {
        const message = typeof args.message === 'string' ? args.message : ''
        if (!message.trim()) {
          return NextResponse.json({ skill, error: 'message is required', elapsedMs: Date.now() - startedAt },
            { status: 400 })
        }
        const conversationId = typeof args.conversationId === 'string' ? args.conversationId : 'node-skill'
        const r = await runAgent(conversationId, message)
        appendLog({
          type: 'angels', source: 'node-skill',
          message: `chat [${r.provider}] · ${r.steps} steps · tools: ${r.toolsUsed.join(', ') || 'none'}`,
        })
        return NextResponse.json({
          skill,
          ok: true,
          response: r.response,
          provider: r.provider,
          steps: r.steps,
          toolsUsed: r.toolsUsed,
          conversationId,
          elapsedMs: Date.now() - startedAt,
        })
      }

      default:
        return NextResponse.json({
          error: `unknown skill '${skill}'`,
          available: [...KINDS],
        }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    appendLog({ type: 'error', source: 'node-skill', message: `${skill} failed: ${msg}` })
    return NextResponse.json({ skill, error: msg, elapsedMs: Date.now() - startedAt }, { status: 500 })
  }
}
