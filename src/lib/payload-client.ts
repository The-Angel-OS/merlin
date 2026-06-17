/**
 * Payload CMS Client — talks to the Angel OS mothership
 *
 * Pattern: fetch from mothership → fall back to local cache → mark offline
 * This makes NIMUE a pure client of Angel OS, wrappable as iOS/Android.
 */
import { getSettings } from './store'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const CACHE_DIR = join(process.cwd(), 'data', 'payload-cache')
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

export interface PayloadResult<T> {
  data: T | null
  source: 'live' | 'cache' | 'empty'
  error?: string
  cachedAt?: string
}

function cacheKey(path: string) {
  return path.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json'
}

function readCache<T>(path: string): { data: T; cachedAt: string } | null {
  try {
    const file = join(CACHE_DIR, cacheKey(path))
    if (!existsSync(file)) return null
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

function writeCache<T>(path: string, data: T) {
  try {
    const file = join(CACHE_DIR, cacheKey(path))
    writeFileSync(file, JSON.stringify({ data, cachedAt: new Date().toISOString() }, null, 2))
  } catch (err) {
    console.error('[payload-cache] write failed:', err)
  }
}

/**
 * Fetch from Payload CMS REST API with cache-fallback.
 * Path should start with `/api/` (e.g. `/api/pages?where[slug][equals]=home`).
 */
export async function payloadFetch<T = any>(
  path: string,
  init?: RequestInit,
): Promise<PayloadResult<T>> {
  const settings = await getSettings()
  const baseUrl = (settings.angelsApiUrl as string) || 'https://www.spacesangels.com'
  const apiKey = settings.angelsApiKey as string | undefined

  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> || {}),
  }
  if (apiKey) headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    const res = await fetch(url, { ...init, headers, signal: controller.signal, cache: 'no-store' })
    clearTimeout(timeout)

    if (!res.ok) {
      const cached = readCache<T>(path)
      if (cached) {
        return { data: cached.data, source: 'cache', cachedAt: cached.cachedAt, error: `HTTP ${res.status}` }
      }
      return { data: null, source: 'empty', error: `HTTP ${res.status}` }
    }

    const data = (await res.json()) as T
    writeCache(path, data)
    return { data, source: 'live' }
  } catch (err: any) {
    // Network/timeout failure — fall back to cache
    const cached = readCache<T>(path)
    if (cached) {
      return { data: cached.data, source: 'cache', cachedAt: cached.cachedAt, error: err.message }
    }
    return { data: null, source: 'empty', error: err.message || 'fetch failed' }
  }
}

/* ─────────── Typed collection accessors ─────────── */

export interface PayloadList<T> {
  docs: T[]
  totalDocs: number
  limit: number
  page: number
  hasNextPage: boolean
}

export interface PayloadTenant {
  id: string
  name: string
  slug: string
  domain?: string
}

export interface PayloadSpace {
  id: string
  name: string
  slug: string
  description?: string
  tenant?: string | PayloadTenant
}

export interface PayloadPost {
  id: string
  title: string
  slug: string
  publishedAt?: string
  _status?: string
}

export interface PayloadEvent {
  id: string
  title: string
  slug: string
  startDate?: string
  endDate?: string
}

export interface PayloadProduct {
  id: string
  title: string
  slug: string
  price?: number
}

export interface PayloadOrder {
  id: string
  orderNumber: string
  total?: number
  status?: string
  createdAt: string
}

export async function listSpaces() {
  return payloadFetch<PayloadList<PayloadSpace>>('/api/spaces?limit=20&depth=1')
}

export async function listPosts() {
  return payloadFetch<PayloadList<PayloadPost>>('/api/posts?limit=20&sort=-publishedAt&where[_status][equals]=published')
}

export async function listEvents() {
  return payloadFetch<PayloadList<PayloadEvent>>('/api/events?limit=20&sort=-startDate')
}

export async function listProducts() {
  return payloadFetch<PayloadList<PayloadProduct>>('/api/products?limit=20')
}

export async function listOrders() {
  return payloadFetch<PayloadList<PayloadOrder>>('/api/orders?limit=20&sort=-createdAt')
}

export async function listTenants() {
  return payloadFetch<PayloadList<PayloadTenant>>('/api/tenants?limit=50')
}
