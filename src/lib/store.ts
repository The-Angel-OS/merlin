/**
 * store.ts — Atomic JSON file store for NIMUE Command Center
 * Zero native deps. All data in C:\Dev\mediaserver\data\
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

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

// ─── Activity Log ────────────────────────────────────────────────────────────
export type LogType = 'file_arrived' | 'youtube_update' | 'api_call' | 'incident' | 'system' | 'error' | 'angels' | 'info'

export interface LogEntry {
  id: string
  timestamp: string
  type: LogType
  source: string
  message: string
  metadata?: Record<string, unknown>
}

const MAX_LOG = 500

export function appendLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
  const log = readStore<LogEntry[]>('activity-log.json', [])
  const newEntry: LogEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    timestamp: new Date().toISOString(),
    ...entry,
  }
  log.unshift(newEntry)
  if (log.length > MAX_LOG) log.splice(MAX_LOG)
  writeStore('activity-log.json', log)
  return newEntry
}

export function getLog(limit = 100, type?: string): LogEntry[] {
  const log = readStore<LogEntry[]>('activity-log.json', [])
  const filtered = type ? log.filter(e => e.type === type) : log
  return filtered.slice(0, limit)
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
  watchedDirs: string[]
  screenshotsDir: string
  masterDescription: string
  port: number
  tvMode: boolean
}

const SETTINGS_DEFAULTS: Settings = {
  youtubeChannelId: '',
  youtubeApiKey: '',
  youtubeClientId: '',
  youtubeClientSecret: '',
  youtubeRefreshToken: '',
  angelsApiUrl: 'https://www.spacesangels.com',
  angelsApiKey: '',
  anthropicApiKey: '',
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
}

export function getSettings(): Settings {
  return { ...SETTINGS_DEFAULTS, ...readStore<Partial<Settings>>('settings.json', {}) }
}

export function updateSettings(updates: Partial<Settings>): Settings {
  const current = getSettings()
  const updated = { ...current, ...updates }
  writeStore('settings.json', updated)
  return updated
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

export function getYouTubeCache(): YouTubeCache {
  return readStore<YouTubeCache>('youtube-cache.json', {})
}

export function setYouTubeCache(data: Partial<YouTubeCache>): void {
  const current = getYouTubeCache()
  writeStore('youtube-cache.json', { ...current, ...data, updatedAt: new Date().toISOString() })
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

export function getFiles(status?: FileStatus): FileRecord[] {
  const files = readStore<FileRecord[]>('file-registry.json', [])
  return status ? files.filter(f => f.status === status) : files
}

export function upsertFile(record: Omit<FileRecord, 'id'> & { id?: string }): FileRecord {
  const files = readStore<FileRecord[]>('file-registry.json', [])
  const idx = files.findIndex(f => f.path === record.path)
  const full: FileRecord = { id: Date.now().toString(36), ...record }
  if (idx >= 0) {
    files[idx] = { ...files[idx], ...record }
  } else {
    files.unshift(full)
  }
  if (files.length > 1000) files.splice(1000)
  writeStore('file-registry.json', files)
  return full
}

export function updateFile(id: string, updates: Partial<FileRecord>): void {
  const files = readStore<FileRecord[]>('file-registry.json', [])
  const idx = files.findIndex(f => f.id === id)
  if (idx >= 0) {
    files[idx] = { ...files[idx], ...updates }
    writeStore('file-registry.json', files)
  }
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

export function getIncidents(status?: IncidentStatus): Incident[] {
  const incidents = readStore<Incident[]>('incidents.json', [])
  return status ? incidents.filter(i => i.status === status) : incidents
}

export function createIncident(data: Omit<Incident, 'id' | 'timestamp'>): Incident {
  const incidents = readStore<Incident[]>('incidents.json', [])
  const incident: Incident = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    timestamp: new Date().toISOString(),
    ...data,
  }
  incidents.unshift(incident)
  writeStore('incidents.json', incidents)
  appendLog({ type: 'incident', source: data.source, message: `[${data.severity.toUpperCase()}] ${data.title}` })
  return incident
}

export function updateIncident(id: string, updates: Partial<Incident>): void {
  const incidents = readStore<Incident[]>('incidents.json', [])
  const idx = incidents.findIndex(i => i.id === id)
  if (idx >= 0) {
    incidents[idx] = { ...incidents[idx], ...updates }
    if (updates.status === 'resolved') incidents[idx].resolvedAt = new Date().toISOString()
    writeStore('incidents.json', incidents)
  }
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

export function getCameras(): Camera[] {
  return readStore<Camera[]>('cameras.json', [])
}

export function upsertCamera(camera: Omit<Camera, 'id' | 'addedAt'> & { id?: string }): Camera {
  const cameras = readStore<Camera[]>('cameras.json', [])
  const full: Camera = {
    id: camera.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    addedAt: new Date().toISOString(),
    ...camera,
  }
  const idx = cameras.findIndex(c => c.id === full.id)
  if (idx >= 0) cameras[idx] = full
  else cameras.push(full)
  writeStore('cameras.json', cameras)
  return full
}

export function deleteCamera(id: string): void {
  const cameras = readStore<Camera[]>('cameras.json', [])
  writeStore('cameras.json', cameras.filter(c => c.id !== id))
}

// ─── LiveKit / Spaces config ──────────────────────────────────────────────────

export interface LiveKitConfig {
  serverUrl: string   // wss://your-livekit-server.example.com
  apiKey: string
  apiSecret: string
}

export function getLiveKitConfig(): LiveKitConfig {
  return readStore<LiveKitConfig>('livekit.json', { serverUrl: '', apiKey: '', apiSecret: '' })
}

export function setLiveKitConfig(cfg: Partial<LiveKitConfig>): LiveKitConfig {
  const current = getLiveKitConfig()
  const updated = { ...current, ...cfg }
  writeStore('livekit.json', updated)
  return updated
}
