import { NextResponse } from 'next/server'
import { getSettings, appendLog } from '@/lib/store'
import { reportUsage } from '@/lib/node-bus'

export const runtime = 'nodejs'

/**
 * POST /api/ai — Merlin as the Angel OS Ollama GATEWAY.
 *
 * The intelligent proxy in front of Ollama: Nimue/Leo (or any peer) call Merlin
 * here instead of talking to Ollama directly. Merlin enforces policy, logs the
 * call into its activity log, injects the account token for `:cloud` models, and
 * returns an Angel-OS-enriched response. Ollama itself stays bound to localhost.
 *
 * Zero-config by default: no auth key required. The gateway URL is discoverable
 * only through Core's authenticated broker, which gates on endeavor membership.
 * If NODE_AI_KEY / NODE_SKILL_KEY / NODE_REGISTER_KEY IS set, it is enforced
 * as a shared secret (optional hardening for production deployments).
 *
 * Body: { model?, messages: [{role,content}], tools?, key?, stream? (ignored) }
 *  - model defaults to the node's configured ollamaModel.
 *  - a `:cloud` model is routed to Ollama's hosted API with the Bearer token.
 */

const MAX_PROMPT_CHARS = 100_000

function isCloud(model: string): boolean {
  return model.endsWith(':cloud')
}

export async function POST(req: Request) {
  let body: {
    model?: string
    messages?: Array<{ role?: string; content?: string }>
    tools?: unknown[]
    key?: string
    stream?: boolean
  } = {}
  try {
    body = await req.json()
  } catch {
    /* defaults */
  }

  // ── Rail 1: auth (optional) ──
  // Zero-config default: no key → open (gateway URL is only discoverable through
  // Core's authenticated broker). If a key IS set, it's enforced as a shared secret
  // for production deployments that want an extra auth layer.
  const configured = process.env.NODE_AI_KEY || process.env.NODE_SKILL_KEY || process.env.NODE_REGISTER_KEY || ''
  if (configured) {
    const presented = body.key || req.headers.get('x-node-key') || ''
    if (presented !== configured) {
      return NextResponse.json({ error: 'invalid or missing node key' }, { status: 403 })
    }
  }

  const s = getSettings()
  const model = (body.model || s.ollamaModel || process.env.OLLAMA_MODEL || '').trim()
  if (!model) {
    return NextResponse.json({ error: 'no model specified and no ollamaModel configured' }, { status: 400 })
  }

  // ── Rail 2: policy ──
  const allowed = (process.env.MERLIN_AI_ALLOWED_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  if (allowed.length && !allowed.includes(model)) {
    appendLog({ type: 'system', source: 'ai-gateway', message: `blocked model "${model}" (not in allowlist)` })
    return NextResponse.json({ error: `model "${model}" is not allowed on this node` }, { status: 403 })
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) {
    return NextResponse.json({ error: 'messages[] is required' }, { status: 400 })
  }
  const totalChars = messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0)
  if (totalChars > MAX_PROMPT_CHARS) {
    return NextResponse.json({ error: `prompt too large (${totalChars} chars; max ${MAX_PROMPT_CHARS})` }, { status: 413 })
  }

  // ── Forward to Ollama (local OR :cloud) ──
  const cloud = isCloud(model)
  const token = s.ollamaApiKey || process.env.OLLAMA_API_KEY || ''
  if (cloud && !token) {
    return NextResponse.json({ error: ':cloud model needs an Ollama account token (set ollamaApiKey)' }, { status: 400 })
  }
  const base = cloud ? 'https://ollama.com' : s.ollamaUrl || process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const started = Date.now()
  try {
    const upstream = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        ...(Array.isArray(body.tools) && body.tools.length ? { tools: body.tools } : {}),
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    })
    const elapsed = Date.now() - started

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 300)
      appendLog({ type: 'error', source: 'ai-gateway', message: `${model} → Ollama ${upstream.status} (${elapsed}ms)` })
      return NextResponse.json({ error: `Ollama ${upstream.status}`, detail }, { status: 502 })
    }

    const data = (await upstream.json()) as Record<string, unknown>

    // Ollama returns rich perf metrics — capture them as the METER for the
    // inference-as-value economy (Thread 7 addendum). tokensOut/sec is the headline
    // throughput figure (the "~300 tok/s" feel); tokensIn/Out + durations feed the
    // physics-based contribution weighting later. nanoseconds → ms for durations.
    const num = (k: string) => (typeof data[k] === 'number' ? (data[k] as number) : undefined)
    const tokensIn = num('prompt_eval_count')
    const tokensOut = num('eval_count')
    const evalNs = num('eval_duration')
    const totalNs = num('total_duration')
    const tokensPerSec = tokensOut && evalNs ? Math.round((tokensOut / evalNs) * 1e9) : undefined
    const metrics = {
      tokensIn,
      tokensOut,
      tokensPerSec,
      evalMs: evalNs ? Math.round(evalNs / 1e6) : undefined,
      totalMs: totalNs ? Math.round(totalNs / 1e6) : undefined,
    }

    appendLog({
      type: 'angels',
      source: 'ai-gateway',
      message: `${model} ${cloud ? '(cloud)' : '(local)'} · ${messages.length} msg · ${elapsed}ms${
        tokensPerSec ? ` · ${tokensPerSec} tok/s` : ''
      }${tokensOut ? ` · ${tokensOut} out` : ''}`,
      metadata: { backend: cloud ? 'ollama-cloud' : 'ollama-local', model, elapsedMs: elapsed, ...metrics },
    })

    // Meter this gateway turn UP to Core's cost ledger (compute commons). The gateway
    // has the richest signal (real Ollama token counts), so this is the best meter.
    void reportUsage({
      provider: cloud ? 'ollama-cloud' : 'ollama',
      backend: cloud ? 'ollama-cloud' : 'ollama-local',
      model,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      tokensPerSec,
      latencyMs: elapsed,
    })

    // Angel-OS-enriched response (Merlin metadata wrapped around the raw reply).
    // The `metrics` block is the contribution receipt the broker/Core meters on.
    return NextResponse.json({
      ...data,
      angel_os: {
        gateway: 'merlin',
        backend: cloud ? 'ollama-cloud' : 'ollama-local',
        model,
        elapsedMs: elapsed,
        metrics,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    appendLog({ type: 'error', source: 'ai-gateway', message: `${model} failed: ${msg}` })
    return NextResponse.json({ error: 'gateway error', detail: msg }, { status: 502 })
  }
}
