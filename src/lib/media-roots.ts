import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

/**
 * Best-effort Windows drive-type map — 'F' → 2 removable | 3 local | 4 network |
 * 5 cd/dvd. Lets discovery flag flash/removable media distinctly. Fail-soft: an
 * empty map just means every non-system drive is offered generically.
 */
function getDriveTypes(): Record<string, number> {
  if (process.platform !== 'win32') return {}
  try {
    const out = execSync(
      'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_LogicalDisk | ForEach-Object { \\"$($_.DeviceID) $($_.DriveType)\\" }"',
      { timeout: 5000, windowsHide: true, encoding: 'utf-8' },
    )
    const map: Record<string, number> = {}
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z]):\s+(\d)/)
      if (m) map[m[1].toUpperCase()] = Number(m[2])
    }
    return map
  } catch {
    return {}
  }
}

const CONFIG_PATH = path.resolve('data/media-roots.json')

export interface MediaRootConfig {
  path: string
  label: string
  icon: string
  /** Serve this drive in Merlin's own UI (local browsing). */
  enabled: boolean
  /** Publish this drive UP to the endeavor/federation. Separate from local serving —
   * opt-in (default false) so you share only what you mean to, not your whole disk. */
  shared?: boolean
  /** Minimum file size in MB to show (0 = show everything). Defaults to 0. */
  minSizeMB?: number
}

export interface MediaRootsConfig {
  roots: MediaRootConfig[]
  moviesMinSizeMB: number
}

const DEFAULT_CONFIG: MediaRootsConfig = {
  roots: [],
  moviesMinSizeMB: 500,
}

export function loadRoots(): MediaRootsConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      return { ...DEFAULT_CONFIG, ...raw }
    }
  } catch { /* fall through */ }
  return { ...DEFAULT_CONFIG }
}

export function saveRoots(config: MediaRootsConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

export function getEnabledRoots(): MediaRootConfig[] {
  return loadRoots().roots.filter(r => r.enabled && fs.existsSync(r.path))
}

/** Normalize a path for case-insensitive prefix comparison (Windows). */
function norm(p: string): string {
  return path.resolve(p).toLowerCase().replace(/[\\/]+$/, '')
}

/**
 * Is `dir` inside any enabled root? Used as the access-control gate for both
 * directory browsing and file streaming.
 */
export function isPathAllowed(dir: string): boolean {
  const target = norm(dir)
  return getEnabledRoots().some(r => {
    const root = norm(r.path)
    return target === root || target.startsWith(root + path.sep) || target.startsWith(root + '/')
  })
}

/**
 * Roots explicitly SHARED up to the federation (opt-in, default false) — a
 * STRICTER set than getEnabledRoots(). This is the scoped-grant boundary for any
 * skill invoked by a peer (LEO over federation): a node exposes only what its
 * owner deliberately marked `shared`, never its whole disk.
 */
export function getSharedRoots(): MediaRootConfig[] {
  return loadRoots().roots.filter(r => r.shared && r.enabled && fs.existsSync(r.path))
}

/**
 * Federation access gate: is `dir` inside a SHARED root? Use this — NOT
 * isPathAllowed (which uses the laxer enabled set) — to clamp any externally
 * triggered file operation. Returns false for paths outside every shared root,
 * so a peer can never list `C:\Users\...` just because it's enabled locally.
 */
export function isPathShared(dir: string): boolean {
  const target = norm(dir)
  return getSharedRoots().some(r => {
    const root = norm(r.path)
    return target === root || target.startsWith(root + path.sep) || target.startsWith(root + '/')
  })
}

/** The minimum file size (bytes) that applies to files under `dir`. */
export function minSizeBytesFor(dir: string): number {
  const target = norm(dir)
  // Most specific (longest) matching root wins.
  const match = getEnabledRoots()
    .map(r => ({ r, root: norm(r.path) }))
    .filter(({ root }) => target === root || target.startsWith(root + path.sep) || target.startsWith(root + '/'))
    .sort((a, b) => b.root.length - a.root.length)[0]
  if (!match) return 0
  return (match.r.minSizeMB ?? 0) * 1024 * 1024
}

function guessIcon(dirName: string, dirPath: string): string {
  const lc = dirName.toLowerCase()
  const pathLc = dirPath.toLowerCase()
  if (lc === 'movies' || lc === 'films') return '🎬'
  if (lc === 'daily') return '📅'
  if (lc === 'dashcam' || lc === 'cardv') return '🚗'
  if (lc === 'camera') return '📷'
  if (lc === 'dcim') return '📷'
  if (lc === 'screenshots' || lc === 'screen recordings') return '🖥️'
  if (lc === 'youtube') return '▶️'
  if (lc === 'music' || lc === 'sound recordings') return '🎵'
  if (lc === 'pictures' || lc === 'photos') return '🖼️'
  if (lc === 'videos') return '🎥'
  if (lc === 'shorts') return '📱'
  if (lc === 'recordings' || lc === 'obs') return '⏺️'
  if (pathLc.includes('seagate') || pathLc.includes('portable')) return '💾'
  return '📁'
}

function guessLabel(dirName: string, driveLetter: string): string {
  return `${dirName} (${driveLetter}:)`
}

export interface ScannedDir {
  path: string
  label: string
  icon: string
  drive: string
  driveLabel: string
  hasMedia: boolean
  subDirCount: number
  alreadyConfigured: boolean
}

export async function scanForMediaDirs(): Promise<ScannedDir[]> {
  const results: ScannedDir[] = []
  const config = loadRoots()
  const configuredPaths = new Set(config.roots.map(r => r.path.toLowerCase()))

  // Discover drives
  const driveInfo: { letter: string; label: string }[] = []
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`
    try {
      if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
        driveInfo.push({ letter, label: letter })
      }
    } catch { /* skip */ }
  }

  // Offer each NON-SYSTEM drive's root as a share candidate, so a flash/external
  // drive (F:, etc.) is discoverable even when its media lives in folders we
  // don't recognize — or at the drive root. C: is skipped (never offer the whole
  // system disk; its user folders are surfaced separately below). Removable
  // drives are flagged so flash media reads as flash media.
  const driveTypes = getDriveTypes()
  const driveRoots: ScannedDir[] = []
  for (const drive of driveInfo) {
    if (drive.letter === 'C') continue
    const root = `${drive.letter}:\\`
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
        .filter(d => !d.name.startsWith('$') && !d.name.startsWith('.'))
    } catch {
      continue // unreadable (empty card slot, permission) — skip
    }
    if (entries.length === 0) continue
    const type = driveTypes[drive.letter]
    const removable = type === 2
    const cd = type === 5
    driveRoots.push({
      path: root,
      label: removable ? `Flash Drive (${drive.letter}:)` : cd ? `Disc (${drive.letter}:)` : `Whole Drive (${drive.letter}:)`,
      icon: removable ? '💾' : cd ? '💿' : '🗄️',
      drive: drive.letter,
      driveLabel: drive.label,
      hasMedia: true,
      subDirCount: entries.filter(e => e.isDirectory()).length,
      alreadyConfigured: configuredPaths.has(root.toLowerCase()),
    })
  }

  const MEDIA_DIRS_TO_CHECK = [
    'DCIM', 'Movies', 'Videos', 'Music', 'Pictures', 'Photos',
  ]

  const HOME = process.env.USERPROFILE || process.env.HOME || ''

  for (const drive of driveInfo) {
    const root = `${drive.letter}:\\`

    // Check top-level media directories
    for (const dirName of MEDIA_DIRS_TO_CHECK) {
      const fullPath = path.join(root, dirName)
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          const subDirs = fs.readdirSync(fullPath, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('$'))

          results.push({
            path: fullPath,
            label: guessLabel(dirName, drive.letter),
            icon: guessIcon(dirName, fullPath),
            drive: drive.letter,
            driveLabel: drive.label,
            hasMedia: true,
            subDirCount: subDirs.length,
            alreadyConfigured: configuredPaths.has(fullPath.toLowerCase()),
          })

          // Also offer sub-directories of DCIM (Camera, Daily, etc.)
          if (dirName === 'DCIM') {
            for (const sub of subDirs) {
              const subPath = path.join(fullPath, sub.name)
              results.push({
                path: subPath,
                label: `${sub.name} (${drive.letter}:\\DCIM)`,
                icon: guessIcon(sub.name, subPath),
                drive: drive.letter,
                driveLabel: drive.label,
                hasMedia: true,
                subDirCount: 0,
                alreadyConfigured: configuredPaths.has(subPath.toLowerCase()),
              })
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  // Also check user home directories
  if (HOME) {
    for (const dirName of ['Videos', 'Pictures', 'Music', 'Movies']) {
      const fullPath = path.join(HOME, dirName)
      const alreadyListed = results.some(r => r.path.toLowerCase() === fullPath.toLowerCase())
      try {
        if (!alreadyListed && fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          const subDirs = fs.readdirSync(fullPath, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('$'))

          results.push({
            path: fullPath,
            label: `${dirName} (Home)`,
            icon: guessIcon(dirName, fullPath),
            drive: fullPath.charAt(0).toUpperCase(),
            driveLabel: 'Home',
            hasMedia: true,
            subDirCount: subDirs.length,
            alreadyConfigured: configuredPaths.has(fullPath.toLowerCase()),
          })

          // Offer sub-directories of Videos (Daily, etc.)
          if (dirName === 'Videos') {
            for (const sub of subDirs) {
              const subPath = path.join(fullPath, sub.name)
              if (sub.name.startsWith('_') || sub.name.startsWith('.')) continue
              results.push({
                path: subPath,
                label: `${sub.name} (Home\\Videos)`,
                icon: guessIcon(sub.name, subPath),
                drive: fullPath.charAt(0).toUpperCase(),
                driveLabel: 'Home',
                hasMedia: true,
                subDirCount: 0,
                alreadyConfigured: configuredPaths.has(subPath.toLowerCase()),
              })
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  // Whole-drive roots first so a flash/external drive is visible without scrolling.
  return [...driveRoots, ...results]
}
