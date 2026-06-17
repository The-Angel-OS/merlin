import { NextRequest, NextResponse } from 'next/server'
import { askLeo, generateChapters, suggestHashtags, optimizeDescription } from '@/lib/angels'

export async function POST(req: NextRequest) {
  const { action, prompt, history, srtContent, title, description } = await req.json() as any

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
      response = await askLeo(prompt, history || [])
  }

  return NextResponse.json({ response })
}
