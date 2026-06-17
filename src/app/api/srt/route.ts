import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { appendLog } from '@/lib/store'

// Clean an SRT file: merge overlapping fragments, remove empties, fix timestamps
function cleanSrt(raw: string): { cleaned: string; chapters: string } {
  const blocks = raw.trim().split(/\n\s*\n/)
  const entries: { index: number; start: string; end: string; text: string }[] = []

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue
    const timeLine = lines.find(l => l.includes('-->'))
    if (!timeLine) continue
    const [startRaw, endRaw] = timeLine.split('-->').map(s => s.trim())
    // Fix malformed milliseconds (e.g. 1000 → 999)
    const fixTs = (ts: string) => ts.replace(/,(\d{4,})/g, (_m, ms) => `,${Math.min(parseInt(ms), 999).toString().padStart(3, '0')}`)
    const start = fixTs(startRaw)
    const end = fixTs(endRaw)
    const textLines = lines.filter(l => !l.match(/^\d+$/) && !l.includes('-->') && l.trim())
    const text = textLines.join(' ').trim()
    if (!text) continue
    entries.push({ index: entries.length + 1, start, end, text })
  }

  // Merge consecutive entries with identical or near-duplicate text
  const merged: typeof entries = []
  for (const entry of entries) {
    if (merged.length === 0) { merged.push({ ...entry }); continue }
    const prev = merged[merged.length - 1]
    // Merge if same text or one contains the other (word fragments)
    if (prev.text === entry.text || prev.text.includes(entry.text) || entry.text.includes(prev.text)) {
      prev.end = entry.end
      if (entry.text.length > prev.text.length) prev.text = entry.text
    } else {
      merged.push({ ...entry })
    }
  }

  // Re-number and format
  const cleaned = merged.map((e, i) => `${i + 1}\n${e.start} --> ${e.end}\n${e.text}`).join('\n\n')

  // Generate chapters (every ~5 minutes, based on timestamps)
  const toSeconds = (ts: string) => {
    const [hms, ms] = ts.split(',')
    const [h, m, s] = hms.split(':').map(Number)
    return h * 3600 + m * 60 + s
  }
  const toTimecode = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`
  }

  const chapterInterval = 300 // 5 minutes
  const chapterLines: string[] = ['0:00 Intro']
  let lastChapter = 0
  for (const e of merged) {
    const secs = toSeconds(e.start)
    if (secs - lastChapter >= chapterInterval) {
      chapterLines.push(`${toTimecode(secs)} ${e.text.slice(0, 60).replace(/\n/g, ' ')}`)
      lastChapter = secs
    }
  }
  const chapters = chapterLines.join('\n')

  return { cleaned, chapters }
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  try {
    const raw = readFileSync(path, 'utf-8')
    const { cleaned, chapters } = cleanSrt(raw)
    await appendLog({ type: 'system', source: 'srt-cleaner', message: `Cleaned SRT: ${path}`, metadata: { path, inputBlocks: raw.split(/\n\s*\n/).length } })
    return NextResponse.json({ cleaned, chapters })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
