import { getSettings, appendLog } from './store'
import { buildBoloSystemPrompt, buildBoloUserPrompt, validateAnalysis, logBoloAudit } from './guardian-conduct'
import type { BoloAnalysis } from './guardian-conduct'

// ── Vision Model Resolution ──────────────────────────────────────────────────

function visionModel(): string {
  const s = getSettings()
  return (
    s.boloVisionModel ||
    process.env.BOLO_VISION_MODEL ||
    s.ollamaModel?.replace(/:cloud$/, '') ||
    process.env.OLLAMA_MODEL?.replace(/:cloud$/, '') ||
    'llava'
  )
}

function ollamaUrl(): string {
  return getSettings().ollamaUrl || process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
}

// ── BOLO Analysis ────────────────────────────────────────────────────────────

export interface BoloResult {
  ok: boolean
  analysis?: BoloAnalysis
  model: string
  elapsedMs: number
  error?: string
}

export async function analyzeFrame(frameBase64: string, label: string): Promise<BoloResult> {
  const model = visionModel()
  const base = ollamaUrl()
  const started = Date.now()

  try {
    const response = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: `${buildBoloSystemPrompt()}\n\n${buildBoloUserPrompt()}`,
        images: [frameBase64],
        stream: false,
        options: {
          temperature: 0.1,
          top_p: 0.9,
          num_predict: 1024,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    })

    const elapsed = Date.now() - started

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300)
      appendLog({
        type: 'error',
        source: 'bolo',
        message: `BOLO ${model} ${response.status} (${elapsed}ms): ${detail}`,
      })
      return { ok: false, model, elapsedMs: elapsed, error: `Ollama ${response.status}: ${detail}` }
    }

    const data = (await response.json()) as { response?: string; error?: string }
    if (data.error) {
      return { ok: false, model, elapsedMs: elapsed, error: data.error }
    }

    const raw = (data.response || '').trim()
    const analysis = validateAnalysis(raw)
    if (!analysis) {
      appendLog({
        type: 'warning',
        source: 'bolo',
        message: `BOLO returned unparseable JSON from ${model}: ${raw.slice(0, 200)}`,
      })
      return { ok: false, model, elapsedMs: elapsed, error: 'unparseable analysis response' }
    }

    logBoloAudit(analysis, label)

    appendLog({
      type: analysis.boloPriority === 'none' || analysis.boloPriority === 'low' ? 'info' : 'incident',
      source: 'bolo',
      message: `${label}: ${analysis.scene} — ${analysis.people}p ${analysis.vehicles}v — BOLO ${analysis.boloPriority} (${(analysis.confidence * 100).toFixed(0)}%)`,
    })

    return { ok: true, analysis, model, elapsedMs: elapsed }
  } catch (e) {
    const elapsed = Date.now() - started
    const msg = e instanceof Error ? e.message : String(e)
    appendLog({ type: 'error', source: 'bolo', message: `${model} failed (${elapsed}ms): ${msg}` })
    return { ok: false, model, elapsedMs: elapsed, error: msg }
  }
}
