/**
 * store.ts — Merlin's local data layer.
 *
 * MIGRATION IN PROGRESS (store.ts → Payload/SQLite):
 *  - Wave 1 (DONE): record-like data is now Payload-backed + ASYNC — ActivityLog,
 *    Submittals, Files, Incidents, Cameras. The JSON file helpers remain ONLY for
 *    the still-sync config sections (Settings/YouTube/LiveKit) handled in Wave 2.
 *  - All record functions return Promises now. Fire-and-forget callers (appendLog,
 *    addSubmittal) can ignore the promise; readers must `await`.
 *
 * Payload access goes through a lazy getPayload() so importing this module stays
 * cheap and avoids a config import cycle at module load.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

const DATA_DIR = join(process.cwd(), 'data')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

function readStore<T>(filename: string, defaultValue: T): T {
  const filepath = join(DATA_DIR, filename)
  try {
    if (existsSync(filepath)) return JSON.parse(readFileSync(filepath, 'utf-8')) as T
  } catch {}
  return defaultValue
}

function writeStore<T>(filename: string, data: T): void {
  const filepath = join(DATA_DIR, filename)
  writeFileSync(filepath + '.tmp', JSON.stringify(data, null, 2), 'utf-8')
  // Atomic rename
  const { renameSync } = require('fs')
  renameSync(filepath + '.tmp', filepath)
}

/** Lazy Payload handle — never imported at module top-level cost. */
let _pl: Promise<Payload> | null = null
function db(): Promise<Payload> {
  if (!_pl) _pl = getPayload({ config })
  return _pl
}

// ─── Activity Log (Payload: activity-log) ─────────────────────────────────────
export type LogType = 'file_arrived' | 'youtube_update' | 'api_call' | 'incident' | 'system' | 'error' | 'angels' | 'info'

export interface LogEntry {
  id: string
  timestamp: string
  type: LogType
  source: string
  message: string
  metadata?: Record<string, unknown>
}

/** Append a log row. Async; fire-and-forget callers may ignore the promise. */
export async function appendLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): Promise<LogEntry> {
  const payload = await db()
  const doc = await payload.create({
    collection: 'activity-log',
    data: {
      type: entry.type,
      source: entry.source,
      message: entry.message,
      metadata: entry.metadata,
    },
    overrideAccess: true,
  })
  return {
    id: String(doc.id),
    timestamp: (doc.createdAt as string) || new Date().toISOString(),
    type: entry.type,
    source: entry.source,
    message: entry.message,
    metadata: entry.metadata,
  }
}

export async function getLog(limit = 100, type?: string): Promise<LogEntry[]> {
  const payload = await db()
  const res = await payload.find({
    collection: 'activity-log',
    where: type ? { type: { equals: type } } : undefined,
    sort: '-createdAt',
    limit,
    overrideAccess: true,
  })
  return res.docs.map((d: Record<string, unknown>) => ({
    id: String(d.id),
    timestamp: (d.createdAt as string) || '',
    type: d.type as LogType,
    source: String(d.source ?? ''),
    message: String(d.message ?? ''),
    metadata: (d.metadata as Record<string, unknown>) || undefined,
  }))
}

// ─── Submittals (Payload: submittals) ─────────────────────────────────────────
export interface Submittal {
  at: string
  filename: string
  url: string // Core media URL (relative to the bound endeavor)
  source: string // e.g. "OBS Virtual Camera" or "window:Phone Link"
  endeavor: string
}

/** Record a successful submittal so Merlin's Screenshots tab can list it. */
export async function addSubmittal(entry: Submittal): Promise<void> {
  const payload = await db()
  await payload.create({
    collection: 'submittals',
    data: {
      filename: entry.filename,
      url: entry.url,
      source: entry.source,
      endeavor: entry.endeavor,
      at: entry.at,
    },
    overrideAccess: true,
  })
}

export async function getSubmittals(limit = 200): Promise<Submittal[]> {
  const payload = await db()
  const res = await payload.find({
    collection: 'submittals',
    sort: '-createdAt',
    limit,
    overrideAccess: true,
  })
  return res.docs.map((d: Record<string, unknown>) => ({
    at: (d.at as string) || (d.createdAt as string) || '',
    filename: String(d.filename ?? ''),
    url: String(d.url ?? ''),
    source: String(d.source ?? ''),
    endeavor: String(d.endeavor ?? ''),
  }))
}

// ─── Settings ────────────────────────────────────────────────────────────────
export interface Settings {
  youtubeChannelId: string
  youtubeApiKey: string
  youtubeClientId: string
  youtubeClientSecret: string
  youtubeRefreshToken: string
  angelsApiUrl: string
  angelsApiKey: string
  anthropicApiKey: string
  geminiApiKey: string
  /** Ollama base URL (local daemon). Defaults to 127.0.0.1:11434. */
  ollamaUrl: string
  /** Preferred Ollama model. A `:cloud` tag (e.g. nemotron-3-super:cloud) runs on
   *  Ollama's servers and needs ollamaApiKey. */
  ollamaModel: string
  /** Ollama account bearer token — required for `:cloud` models. */
  ollamaApiKey: string
  watchedDirs: string[]
  screenshotsDir: string
  masterDescription: string
  port: number
  tvMode: boolean
  /** Last public tunnel URL (cloudflared quick tunnel). Ephemeral — re-issued each start_tunnel. */
  tunnelUrl: string
  // ─── Federation seed nodes (Gnutella-style bootstrap) ────────────────────────
  /**
   * The federation seed nodes a fresh Merlin knows about out of the box. A node can
   * contribute/borrow intelligence against any of these WITHOUT being bound to an
   * endeavor (the /api/ai gateway is node-key gated, not endeavor gated). Binding to
   * an endeavor (boundEndeavor) is only required to SHARE FILES up. As the federation
   * grows past these two seeds we'll add discovery; for now this is the bootstrap set.
   */
  seedNodes: string[]
  // ─── Node bus binding (docs/architecture/NODE_BUS_COMMS.md on Core) ──────────
  /** The endeavor this node is locked onto (slug). Set on register; drives the heartbeat. */
  boundEndeavor: string
  /** Core base URL this node registers/polls against. */
  boundAngelsUrl: string
  /** Minted node JWT (used as payload-token cookie to poll + post). Refreshed each register. */
  nodeToken: string
  nodeTokenExpiresAt: string
  /** The node's dedicated bus channel slug + AI Bus space id (returned by Core register). */
  busChannel: string
  busSpaceId: string
  /** Poll cursor — newest message createdAt already processed (ISO). */
  busCursor: string
  /** Default local camera device for snap_camera (dshow name). Empty = first available. */
  cameraDevice: string
  // ─── Camera sentinel (change-detection) ──────────────────────────────────────
  /** When true, the sentinel loop polls the camera + submits frames on change. */
  sentinelEnabled: boolean
  /** Camera for the sentinel (falls back to cameraDevice, then first available). */
  sentinelDevice: string
  /** Window TITLE to monitor instead of a camera (gdigrab, e.g. a Bluestacks viewer). Wins over device. */
  sentinelWindow: string
  /** Multi-source: specs like "camera:Integrated Camera" / "window:Bluestacks". When
   *  non-empty, supersedes the single device/window — each source has its own baseline. */
  sentinelSources: string[]
  /** Poll cadence in ms (min 1000). */
  sentinelIntervalMs: number
  /** Change threshold 0..1 (mean abs grayscale diff). ~0.04 = 4% of pixels moved. */
  sentinelThreshold: number
}

const SETTINGS_DEFAULTS: Settings = {
  youtubeChannelId: '',
  youtubeApiKey: '',
  youtubeClientId: '',
  youtubeClientSecret: '',
  youtubeRefreshToken: '',
  angelsApiUrl: 'https://platform.spacesangels.com',
  seedNodes: ['https://platform.spacesangels.com', 'https://federation.kendev.co'],
  angelsApiKey: '',
  anthropicApiKey: '',
  geminiApiKey: '',
  ollamaUrl: '',
  ollamaModel: '',
  ollamaApiKey: '',
  watchedDirs: [
    'C:\\Users\\kenne\\Downloads',
    'C:\\Users\\kenne\\Videos',
    'C:\\Users\\kenne\\Pictures\\Screenshots',
    'C:\\Users\\kenne\\Desktop',
  ],
  screenshotsDir: 'C:\\Users\\kenne\\Pictures\\Screenshots',
  masterDescription: '',
  port: 3030,
  tvMode: false,
  tunnelUrl: '',
  boundEndeavor: '',
  boundAngelsUrl: '',
  nodeToken: '',
  nodeTokenExpiresAt: '',
  busChannel: '',
  busSpaceId: '',
  busCursor: '',
  cameraDevice: '',
  sentinelEnabled: false,
  sentinelDevice: '',
  sentinelWindow: '',
  sentinelSources: [],
  sentinelIntervalMs: 5000,
  sentinelThreshold: 0.04,
}

/**
 * Settings — write-through in-memory cache backed by the Payload `node-settings`
 * global. getSettings() stays SYNCHRONOUS (hot loops read the cache); the global
 * is the durable, admin-editable source of truth.
 *
 * Boot: the cache is seeded synchronously from settings.json (still written for
 * continuity), then asynchronously overlaid from the global if present.
 */
let _settingsCache: Settings = { ...SETTINGS_DEFAULTS, ...readStore<Partial<Settings>>('settings.json', {}) }
let _settingsHydrated = false

/** One-time async overlay from the Payload global (newer values win). */
async function hydrateSettings(): Promise<void> {
  if (_settingsHydrated) return
  _settingsHydrated = true
  try {
    const payload = await db()
    const g = (await payload.findGlobal({ slug: 'node-settings', overrideAccess: true })) as Partial<Settings>
    // A freshly-registered global has all-empty fields. Treat it as authoritative
    // only if it carries real binding data; otherwise seed it from the JSON cache.
    const globalHasData = Boolean(g && (g.boundEndeavor || g.nodeToken || g.angelsApiKey))
    if (globalHasData) {
      const clean: Partial<Settings> = {}
      for (const k of Object.keys(SETTINGS_DEFAULTS) as (keyof Settings)[]) {
        const v = (g as Record<string, unknown>)[k]
        // Skip undefined/null AND empty strings so a blank global field never
        // clobbers a populated cache value.
        if (v !== undefined && v !== null && v !== '') (clean as Record<string, unknown>)[k] = v
      }
      _settingsCache = { ...SETTINGS_DEFAULTS, ..._settingsCache, ...clean }
    } else {
      // First boot after migration — seed the global from the JSON-seeded cache.
      void persistSettingsGlobal(_settingsCache)
    }
  } catch {
    // Payload not ready / global missing — keep the JSON-seeded cache.
  }
}
void hydrateSettings()

function persistSettingsGlobal(data: Settings): Promise<unknown> {
  return db()
    .then((payload) => payload.updateGlobal({ slug: 'node-settings', data: data as unknown as Record<string, unknown>, overrideAccess: true }))
    .catch(() => {})
}

export function getSettings(): Settings {
  return _settingsCache
}

export function updateSettings(updates: Partial<Settings>): Settings {
  _settingsCache = { ..._settingsCache, ...updates }
  writeStore('settings.json', _settingsCache) // boot-continuity mirror
  void persistSettingsGlobal(_settingsCache) // durable + admin-visible
  return _settingsCache
}

// ─── YouTube Cache ────────────────────────────────────────────────────────────
export interface ChannelStats {
  subscriberCount: string
  viewCount: string
  videoCount: string
  title: string
  thumbnailUrl: string
  updatedAt: string
}

export interface VideoRecord {
  id: string
  title: string
  description: string
  publishedAt: string
  viewCount: string
  likeCount: string
  commentCount: string
  thumbnailUrl: string
  duration: string
  status: string
}

export interface YouTubeCache {
  channel?: ChannelStats
  videos?: VideoRecord[]
  updatedAt?: string
}

/** YouTube cache — write-through cache backed by the `youtube-cache` global. */
let _ytCache: YouTubeCache = readStore<YouTubeCache>('youtube-cache.json', {})
let _ytHydrated = false

async function hydrateYouTube(): Promise<void> {
  if (_ytHydrated) return
  _ytHydrated = true
  try {
    const payload = await db()
    const g = (await payload.findGlobal({ slug: 'youtube-cache', overrideAccess: true })) as YouTubeCache
    if (g && (g.channel || g.videos)) _ytCache = { channel: g.channel, videos: g.videos, updatedAt: g.updatedAt }
  } catch {}
}
void hydrateYouTube()

export function getYouTubeCache(): YouTubeCache {
  return _ytCache
}

export function setYouTubeCache(data: Partial<YouTubeCache>): void {
  _ytCache = { ..._ytCache, ...data, updatedAt: new Date().toISOString() }
  writeStore('youtube-cache.json', _ytCache)
  void db()
    .then((payload) => payload.updateGlobal({ slug: 'youtube-cache', data: _ytCache as Record<string, unknown>, overrideAccess: true }))
    .catch(() => {})
}

// ─── File Registry ────────────────────────────────────────────────────────────
export type FileStatus = 'new' | 'reviewed' | 'archived' | 'linked'
export type FileCategory = 'video' | 'image' | 'srt' | 'document' | 'audio' | 'other'

export interface FileRecord {
  id: string
  path: string
  name: string
  ext: string
  category: FileCategory
  size: number
  detectedAt: string
  status: FileStatus
  youtubeId?: string
  notes?: string
}

function fileDocToRecord(d: Record<string, unknown>): FileRecord {
  return {
    id: String(d.id),
    path: String(d.path ?? ''),
    name: String(d.name ?? ''),
    ext: String(d.ext ?? ''),
    category: (d.category as FileCategory) ?? 'other',
    size: typeof d.size === 'number' ? d.size : 0,
    detectedAt: (d.detectedAt as string) || (d.createdAt as string) || '',
    status: (d.status as FileStatus) ?? 'new',
    youtubeId: (d.youtubeId as string) || undefined,
    notes: (d.notes as string) || undefined,
  }
}

export async function getFiles(status?: FileStatus): Promise<FileRecord[]> {
  const payload = await db()
  const res = await payload.find({
    collection: 'files',
    where: status ? { status: { equals: status } } : undefined,
    sort: '-createdAt',
    limit: 1000,
    overrideAccess: true,
  })
  return res.docs.map((d) => fileDocToRecord(d as Record<string, unknown>))
}

/** Upsert by path (the natural key from the watcher). */
export async function upsertFile(record: Omit<FileRecord, 'id'> & { id?: string }): Promise<FileRecord> {
  const payload = await db()
  const existing = await payload.find({
    collection: 'files',
    where: { path: { equals: record.path } },
    limit: 1,
    overrideAccess: true,
  })
  const data = {
    path: record.path,
    name: record.name,
    ext: record.ext,
    category: record.category,
    size: record.size,
    detectedAt: record.detectedAt,
    status: record.status,
    youtubeId: record.youtubeId,
    notes: record.notes,
  }
  const found = existing.docs[0] as { id: number | string } | undefined
  const doc = found
    ? await payload.update({ collection: 'files', id: found.id, data, overrideAccess: true })
    : await payload.create({ collection: 'files', data, overrideAccess: true })
  return fileDocToRecord(doc as Record<string, unknown>)
}

export async function updateFile(id: string, updates: Partial<FileRecord>): Promise<void> {
  const payload = await db()
  await payload.update({
    collection: 'files',
    id,
    data: updates as Record<string, unknown>,
    overrideAccess: true,
  })
}

// ─── Incidents ────────────────────────────────────────────────────────────────
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IncidentStatus = 'open' | 'investigating' | 'resolved'

export interface Incident {
  id: string
  timestamp: string
  severity: IncidentSeverity
  status: IncidentStatus
  title: string
  description: string
  source: string
  resolvedAt?: string
  notes?: string
}

function incidentDocToRecord(d: Record<string, unknown>): Incident {
  return {
    id: String(d.id),
    timestamp: (d.createdAt as string) || '',
    severity: (d.severity as IncidentSeverity) ?? 'low',
    status: (d.status as IncidentStatus) ?? 'open',
    title: String(d.title ?? ''),
    description: String(d.description ?? ''),
    source: String(d.source ?? ''),
    resolvedAt: (d.resolvedAt as string) || undefined,
    notes: (d.notes as string) || undefined,
  }
}

export async function getIncidents(status?: IncidentStatus): Promise<Incident[]> {
  const payload = await db()
  const res = await payload.find({
    collection: 'incidents',
    where: status ? { status: { equals: status } } : undefined,
    sort: '-createdAt',
    limit: 500,
    overrideAccess: true,
  })
  return res.docs.map((d) => incidentDocToRecord(d as Record<string, unknown>))
}

export async function createIncident(data: Omit<Incident, 'id' | 'timestamp'>): Promise<Incident> {
  const payload = await db()
  const doc = await payload.create({
    collection: 'incidents',
    data: {
      title: data.title,
      description: data.description,
      source: data.source,
      severity: data.severity,
      status: data.status,
      resolvedAt: data.resolvedAt,
      notes: data.notes,
    },
    overrideAccess: true,
  })
  // Mirror into the activity feed (fire-and-forget).
  void appendLog({ type: 'incident', source: data.source, message: `[${data.severity.toUpperCase()}] ${data.title}` })
  return incidentDocToRecord(doc as Record<string, unknown>)
}

export async function updateIncident(id: string, updates: Partial<Incident>): Promise<void> {
  const payload = await db()
  const data: Record<string, unknown> = { ...updates }
  if (updates.status === 'resolved' && !updates.resolvedAt) data.resolvedAt = new Date().toISOString()
  await payload.update({ collection: 'incidents', id, data, overrideAccess: true })
}

// ─── IP Cameras ───────────────────────────────────────────────────────────────

export interface Camera {
  id: string
  name: string
  location: string
  ip: string
  port: number
  username?: string
  password?: string
  /** Path for MJPEG stream, e.g. /video or /cgi-bin/mjpg/video.cgi */
  mjpegPath: string
  /** Path for JPEG snapshot, e.g. /snapshot or /cgi-bin/snapshot.cgi */
  snapshotPath: string
  /** Full RTSP URL if available, e.g. rtsp://user:pass@192.168.1.x:554/stream1 */
  rtspUrl?: string
  /** External HLS URL if pre-converted (nginx/ffmpeg) */
  hlsUrl?: string
  enabled: boolean
  addedAt: string
  /** Protocol: http for MJPEG, hls for HLS, rtsp for raw (requires proxy) */
  protocol: 'http' | 'hls' | 'rtsp'
}

function cameraDocToRecord(d: Record<string, unknown>): Camera {
  return {
    id: String(d.id),
    name: String(d.name ?? ''),
    location: String(d.location ?? ''),
    ip: String(d.ip ?? ''),
    port: typeof d.port === 'number' ? d.port : 80,
    username: (d.username as string) || undefined,
    password: (d.password as string) || undefined,
    mjpegPath: String(d.mjpegPath ?? ''),
    snapshotPath: String(d.snapshotPath ?? ''),
    rtspUrl: (d.rtspUrl as string) || undefined,
    hlsUrl: (d.hlsUrl as string) || undefined,
    enabled: d.enabled !== false,
    addedAt: (d.addedAt as string) || (d.createdAt as string) || '',
    protocol: (d.protocol as Camera['protocol']) ?? 'http',
  }
}

export async function getCameras(): Promise<Camera[]> {
  const payload = await db()
  const res = await payload.find({ collection: 'cameras', limit: 200, overrideAccess: true })
  return res.docs.map((d) => cameraDocToRecord(d as Record<string, unknown>))
}

export async function upsertCamera(camera: Omit<Camera, 'id' | 'addedAt'> & { id?: string }): Promise<Camera> {
  const payload = await db()
  const data = {
    name: camera.name,
    location: camera.location,
    ip: camera.ip,
    port: camera.port,
    username: camera.username,
    password: camera.password,
    mjpegPath: camera.mjpegPath,
    snapshotPath: camera.snapshotPath,
    rtspUrl: camera.rtspUrl,
    hlsUrl: camera.hlsUrl,
    enabled: camera.enabled,
    protocol: camera.protocol,
  }
  const doc = camera.id
    ? await payload.update({ collection: 'cameras', id: camera.id, data, overrideAccess: true })
    : await payload.create({ collection: 'cameras', data: { ...data, addedAt: new Date().toISOString() }, overrideAccess: true })
  return cameraDocToRecord(doc as Record<string, unknown>)
}

export async function deleteCamera(id: string): Promise<void> {
  const payload = await db()
  await payload.delete({ collection: 'cameras', id, overrideAccess: true })
}

// ─── LiveKit / Spaces config ──────────────────────────────────────────────────

export interface LiveKitConfig {
  serverUrl: string   // wss://your-livekit-server.example.com
  apiKey: string
  apiSecret: string
}

/** LiveKit config — write-through cache backed by the `livekit-config` global. */
let _lkCache: LiveKitConfig = readStore<LiveKitConfig>('livekit.json', { serverUrl: '', apiKey: '', apiSecret: '' })
let _lkHydrated = false

async function hydrateLiveKit(): Promise<void> {
  if (_lkHydrated) return
  _lkHydrated = true
  try {
    const payload = await db()
    const g = (await payload.findGlobal({ slug: 'livekit-config', overrideAccess: true })) as LiveKitConfig
    if (g && (g.serverUrl || g.apiKey)) _lkCache = { serverUrl: g.serverUrl || '', apiKey: g.apiKey || '', apiSecret: g.apiSecret || '' }
    else void persistLiveKit(_lkCache)
  } catch {}
}
void hydrateLiveKit()

function persistLiveKit(cfg: LiveKitConfig): Promise<unknown> {
  return db()
    .then((payload) => payload.updateGlobal({ slug: 'livekit-config', data: cfg as unknown as Record<string, unknown>, overrideAccess: true }))
    .catch(() => {})
}

export function getLiveKitConfig(): LiveKitConfig {
  return _lkCache
}

export function setLiveKitConfig(cfg: Partial<LiveKitConfig>): LiveKitConfig {
  _lkCache = { ..._lkCache, ...cfg }
  writeStore('livekit.json', _lkCache)
  void persistLiveKit(_lkCache)
  return _lkCache
}
