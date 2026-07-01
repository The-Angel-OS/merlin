export type EyeType =
  | 'camera'
  | 'file_watch'
  | 'system_health'
  | 'network_probe'
  | 'microphone'
  | 'process_watch'
  | 'custom'

export interface EyeConfig {
  id: string
  type: EyeType
  label: string
  description?: string
  enabled: boolean
  intervalMs: number
  source?: string
  threshold?: number
  location?: string
  metadata?: Record<string, unknown>
}

export interface Signal {
  id: string
  eyeId: string
  eyeType: EyeType
  type: string
  confidence: number
  summary: string
  timestamp: string
  mediaUrl?: string
  metadata?: Record<string, unknown>
  location?: string
}

export interface EyeState {
  config: EyeConfig
  running: boolean
  lastTickAt?: number
  lastSignalAt?: string
  error?: string
  consecutiveErrors: number
}

export interface Subscriber {
  id: string
  url?: string
  ws?: WebSocket
  filter?: (signal: Signal) => boolean
}

export interface WitnessCatalogEntry {
  id: string
  type: EyeType
  label: string
  capability: string
  status: 'active' | 'error' | 'offline'
  lastSignalAt?: string
  location?: string
}

export interface SystemHealthSnapshot {
  cpuPercent: number
  memoryPercent: number
  memoryFreeGb: number
  diskPercent?: number
  uptimeSec: number
  ollamaAvailable: boolean
  activeEyes: number
  errorEyes: number
  tunnelUrl?: string
}
