/**
 * POST /api/search — run a web search FROM this Merlin node (residential IP).
 *
 * The Core→Merlin search-proxy contract (see angels-os webSearch.ts viaMerlin):
 *   POST { query: string, maxResults?: number }
 *   → 200 { results: [{ title, url, snippet }], provider }
 *
 * Core Leo proxies its web search here so the query runs from a real residential
 * IP (dodges datacenter/cloud-IP blocks) and offloads off Core. Server-side fetch
 * (no CORS). Keyless DuckDuckGo works with zero config; SEARXNG_URL / TAVILY_API_KEY
 * / BRAVE_SEARCH_API_KEY upgrade it (first-available-wins, mirroring Core).
 */
import { NextResponse } from 'next/server'

interface Result { title: string; url: string; snippet: string }

const TIMEOUT_MS = 8000

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function viaSearxng(query: string, max: number, baseUrl: string): Promise<Result[]> {
  const base = baseUrl.replace(/\/+$/, '')
  const res = await timedFetch(`${base}/search?q=${encodeURIComponent(query)}&format=json&safesearch=0`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`)
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }
  return (data.results || []).slice(0, max).map((r) => ({ title: r.title || r.url || 'result', url: r.url || '', snippet: (r.content || '').slice(0, 500) }))
}

async function viaTavily(query: string, max: number, key: string): Promise<Result[]> {
  const res = await timedFetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, max_results: max, search_depth: 'basic' }),
  })
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`)
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }
  return (data.results || []).slice(0, max).map((r) => ({ title: r.title || r.url || 'result', url: r.url || '', snippet: (r.content || '').slice(0, 500) }))
}

async function viaBrave(query: string, max: number, key: string): Promise<Result[]> {
  const res = await timedFetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
  })
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`)
  const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
  return (data.web?.results || []).slice(0, max).map((r) => ({ title: r.title || r.url || 'result', url: r.url || '', snippet: (r.description || '').replace(/<[^>]+>/g, '').slice(0, 500) }))
}

async function viaDuckDuckGo(query: string, max: number): Promise<Result[]> {
  const res = await timedFetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`)
  const data = (await res.json()) as { AbstractText?: string; AbstractURL?: string; Heading?: string; RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> }
  const out: Result[] = []
  if (data.AbstractText && data.AbstractURL) out.push({ title: data.Heading || query, url: data.AbstractURL, snippet: data.AbstractText.slice(0, 500) })
  for (const t of data.RelatedTopics || []) {
    if (out.length >= max) break
    if (t.Text && t.FirstURL) out.push({ title: t.Text.slice(0, 100), url: t.FirstURL, snippet: t.Text.slice(0, 500) })
  }
  return out.slice(0, max)
}

export async function POST(req: Request) {
  let body: { query?: string; maxResults?: number } = {}
  try { body = await req.json() } catch { /* empty body → empty query */ }
  const q = (body.query || '').trim()
  const max = Math.max(1, Math.min(10, Math.round(body.maxResults ?? 5)))
  if (!q) return NextResponse.json({ results: [], provider: 'none', note: 'empty query', node: process.env.NEXT_PUBLIC_BUILD_SHA || 'merlin' })

  const searxng = process.env.SEARXNG_URL
  const tavily = process.env.TAVILY_API_KEY
  const brave = process.env.BRAVE_SEARCH_API_KEY

  if (searxng) { try { return NextResponse.json({ results: await viaSearxng(q, max, searxng), provider: 'searxng' }) } catch { /* fall through */ } }
  if (tavily) { try { return NextResponse.json({ results: await viaTavily(q, max, tavily), provider: 'tavily' }) } catch { /* fall through */ } }
  if (brave) { try { return NextResponse.json({ results: await viaBrave(q, max, brave), provider: 'brave' }) } catch { /* fall through */ } }
  try {
    const results = await viaDuckDuckGo(q, max)
    return NextResponse.json({ results, provider: 'duckduckgo', note: results.length ? undefined : 'no keyless results — set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY' })
  } catch {
    return NextResponse.json({ results: [], provider: 'none', note: 'web search unavailable' })
  }
}
