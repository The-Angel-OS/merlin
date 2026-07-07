import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join, resolve, normalize } from 'path'
import { getThumbnail } from '@/lib/thumbnails'
import { getEnabledRoots, isPathAllowed, minSizeBytesFor } from '@/lib/media-roots'

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ts']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.bmp']

interface MovieItem {
  name: string
  path: string
  size: number
  isDirectory: boolean
  thumbnail?: string
  isRoot?: boolean
  /** 'video' | 'image' for files; omitted for directories. */
  mediaType?: 'video' | 'image'
  /** Last-modified time in ms since epoch (for date sorting). */
  mtimeMs?: number
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dirParam = searchParams.get('dir')
    const roots = getEnabledRoots()

    // ── Home / shortcuts screen ────────────────────────────────────────────
    if (!dirParam) {
      // If there is only one root, jump straight into it
      if (roots.length === 1) {
        return respondDirectory(roots[0].path, minSizeBytesFor(roots[0].path))
      }

      // Multiple roots → return virtual shortcuts list (config order preserved)
      const shortcuts: MovieItem[] = roots.map(r => ({
        name: `${r.icon} ${r.label}`,
        path: r.path,
        size: 0,
        isDirectory: true,
        isRoot: true,
      }))
      return NextResponse.json({ items: shortcuts, currentPath: '', isHome: true })
    }

    // ── Normal directory browse ────────────────────────────────────────────
    const normalizedDir = resolve(dirParam)

    if (!isPathAllowed(normalizedDir)) {
      return NextResponse.json({ error: 'Access denied', items: [] }, { status: 403 })
    }

    return respondDirectory(normalizedDir, minSizeBytesFor(normalizedDir))

  } catch (error) {
    console.error('Error reading movies directory:', error)
    return NextResponse.json(
      { error: 'Failed to read movies directory', items: [] },
      { status: 500 }
    )
  }
}

// Cap total entries processed so a folder with tens of thousands of files (e.g.
// an accumulating DCIM/sentinel capture dir) can't melt the request.
const MAX_ENTRIES = 4000
// Bound how many stat/thumbnail probes run at once. Unbounded Promise.all over
// thousands of files fired thousands of concurrent fs ops on external/slow drives
// → the response never returned → the media library spun forever. This keeps it
// snappy and bounded regardless of folder size.
const FS_CONCURRENCY = 24

/** map() with a fixed worker pool — bounded concurrency, order preserved. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function respondDirectory(dir: string, minSize: number) {
  const allFiles = await readdir(dir)
  const truncated = allFiles.length > MAX_ENTRIES
  const files = truncated ? allFiles.slice(0, MAX_ENTRIES) : allFiles

  const items = await mapLimit(files, FS_CONCURRENCY,
    async (file) => {
      // Skip hidden + thumbnail/temp artifacts (.temp-* from ffmpeg, .DS_Store, dotfiles).
      if (file.startsWith('.')) return null
      const filePath = join(dir, file)
      let stats
      try {
        stats = await stat(filePath)
      } catch {
        return null // permission / broken symlink
      }

      if (stats.isDirectory()) {
        return { name: file, path: filePath, size: 0, isDirectory: true, mtimeMs: stats.mtimeMs } as MovieItem
      }

      const ext = file.toLowerCase().slice(file.lastIndexOf('.'))
      const isVideo = VIDEO_EXTENSIONS.includes(ext)
      const isImage = IMAGE_EXTENSIONS.includes(ext)

      if (isVideo && stats.size >= minSize) {
        const thumbnail = await getThumbnail(filePath, dir, file)
        return {
          name: file,
          path: filePath,
          size: stats.size,
          isDirectory: false,
          thumbnail,
          mediaType: 'video',
          mtimeMs: stats.mtimeMs,
        } as MovieItem
      }

      // Images show in ANY root (no size gate — photos are small). The UI's
      // Videos/Images toggle does the filtering.
      if (isImage) {
        return {
          name: file,
          path: filePath,
          size: stats.size,
          isDirectory: false,
          thumbnail: filePath,
          mediaType: 'image',
          mtimeMs: stats.mtimeMs,
        } as MovieItem
      }

      return null
    })

  const validItems = items.filter((item): item is MovieItem => item !== null)
  const sortedItems = validItems.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return b.name.localeCompare(a.name) // newest-first for daily/dashcam folders
  })

  return NextResponse.json({
    items: sortedItems,
    currentPath: dir,
    ...(truncated ? { truncated: true, shownOf: `${MAX_ENTRIES} of ${allFiles.length}` } : {}),
  })
}
