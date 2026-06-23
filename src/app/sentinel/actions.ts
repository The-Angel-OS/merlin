'use server'
/**
 * Server actions for the Sentinel page — the owner's local UI controls its own node
 * directly (no HTTP key-gate; that gate is for REMOTE peer calls). Reads sources +
 * submittals + status, and starts/stops the change-detection sentinel.
 */
import { startSentinel, stopSentinel, sentinelStatus } from '@/lib/sentinel'
import { listCameras, listWindows } from '@/lib/camera'
import { getSubmittals, getSettings, updateSettings } from '@/lib/store'

export async function getSentinelData() {
  const [cams, wins] = await Promise.all([listCameras(), listWindows()])
  const s = getSettings()
  return {
    status: sentinelStatus(),
    cameras: cams.cameras,
    windows: wins.windows,
    submittals: getSubmittals(120),
    boundEndeavor: s.boundEndeavor || '',
    boundAngelsUrl: s.boundEndeavor ? s.boundAngelsUrl : '',
  }
}

export interface SentinelConfig {
  device?: string
  window?: string
  intervalMs?: number
  threshold?: number
}

export async function startSentinelAction(cfg: SentinelConfig) {
  const patch: Record<string, unknown> = {}
  // device + window are mutually exclusive — setting one clears the other.
  if (typeof cfg.window === 'string' && cfg.window) {
    patch.sentinelWindow = cfg.window
    patch.sentinelDevice = ''
  } else if (typeof cfg.device === 'string') {
    patch.sentinelDevice = cfg.device
    patch.sentinelWindow = ''
  }
  if (typeof cfg.intervalMs === 'number' && cfg.intervalMs >= 1000) patch.sentinelIntervalMs = cfg.intervalMs
  if (typeof cfg.threshold === 'number' && cfg.threshold > 0 && cfg.threshold <= 1) patch.sentinelThreshold = cfg.threshold
  if (Object.keys(patch).length) updateSettings(patch)
  startSentinel()
  return sentinelStatus()
}

export async function stopSentinelAction() {
  stopSentinel()
  return sentinelStatus()
}
