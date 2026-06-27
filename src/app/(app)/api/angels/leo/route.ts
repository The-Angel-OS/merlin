import { NextRequest, NextResponse } from 'next/server'
import { askLeo, generateChapters, suggestHashtags, optimizeDescription } from '@/lib/angels'
import { getSettings } from '@/lib/store'
import { runAgent } from '@/lib/leoAgent'

export async function POST(req: NextRequest) {
  const { action, prompt, history, srtContent, title, description, conversationId, brain } =
    (await req.json()) as any

  try {
    let response: string

    switch (action) {
      case 'chapters':
        if (!srtContent) return NextResponse.json({ error: 'srtContent required' }, { status: 400 })
        response = await generateChapters(srtContent)
        break
      case 'hashtags':
        response = await suggestHashtags(title || '', description || '')
        break
      case 'optimize':
        if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })
        response = await optimizeDescription(description)
        break
      case 'chat':
      default:
        if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })
        // Brain selection (explicit > inferred):
        //   'local'  → on-box agentic loop (Ollama/Gemini/Anthropic) — Merlin's own brain.
        //   'remote' → the Core/LEO bridge.
        //   'auto' (default) → local when any on-box provider is configured, else remote.
        {
          const s = getSettings()
          const hasLocalProvider = Boolean(s.geminiApiKey || s.anthropicApiKey || s.ollamaModel)
          const useLocal = brain === 'local' || (brain !== 'remote' && hasLocalProvider)
          if (useLocal) {
            const r = await runAgent(conversationId || 'default', prompt)
            return NextResponse.json({
              response: r.response,
              steps: r.steps,
              toolsUsed: r.toolsUsed,
              provider: r.provider,
              brain: 'local',
            })
          }
        }
        response = await askLeo(prompt, history || [])
        return NextResponse.json({ response, brain: 'remote', provider: 'core-leo' })
    }

    return NextResponse.json({ response })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
