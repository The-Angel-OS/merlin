import { NextRequest, NextResponse } from 'next/server'
import { askLeo, generateChapters, suggestHashtags, optimizeDescription } from '@/lib/angels'
import { getSettings } from '@/lib/store'
import { runAgent } from '@/lib/leoAgent'

export async function POST(req: NextRequest) {
  const { action, prompt, history, srtContent, title, description, conversationId } =
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
        // On-box agentic loop with local tools when any AI key is set; else legacy proxy.
        {
          const s = getSettings()
          if (s.geminiApiKey || s.anthropicApiKey) {
            const r = await runAgent(conversationId || 'default', prompt)
            return NextResponse.json({ response: r.response, steps: r.steps, toolsUsed: r.toolsUsed, provider: r.provider })
          }
        }
        response = await askLeo(prompt, history || [])
    }

    return NextResponse.json({ response })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
