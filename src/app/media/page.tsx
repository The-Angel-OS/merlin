'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MediaViewer from '@/components/MediaViewer'
import MediaSettings from '@/components/MediaSettings'

interface MovieItem {
  name: string
  path: string
  size: number
  isDirectory: boolean
  thumbnail?: string
  isRoot?: boolean
  mediaType?: 'video' | 'image'
  mtimeMs?: number
}

type MediaFilter = 'all' | 'video' | 'image'
type SortKey = 'name' | 'modified'
type SortDir = 'asc' | 'desc'
type ThumbSize = 'sm' | 'md' | 'lg'

const GRID_COLS: Record<ThumbSize, string> = {
  sm: 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-10',
  md: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
  lg: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}
const CARD_MAXW: Record<ThumbSize, string> = {
  sm: 'max-w-[130px]',
  md: 'max-w-[200px]',
  lg: 'max-w-[320px]',
}

function MediaLibrary() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<MovieItem[]>([])
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState<string>('')
  const [isHome, setIsHome] = useState(false)
  const [pathHistory, setPathHistory] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [thumbSize, setThumbSize] = useState<ThumbSize>('md')

  // Derived: folders (always shown) + files (filtered by media type), each sorted.
  const sortFn = useMemo(() => {
    return (a: MovieItem, b: MovieItem) => {
      let cmp: number
      if (sortKey === 'modified') cmp = (a.mtimeMs ?? 0) - (b.mtimeMs ?? 0)
      else cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    }
  }, [sortKey, sortDir])

  const folders = useMemo(
    () => items.filter(i => i.isDirectory).sort(sortFn),
    [items, sortFn],
  )
  const allFiles = useMemo(() => items.filter(i => !i.isDirectory), [items])
  const videoCount = useMemo(() => allFiles.filter(i => i.mediaType === 'video').length, [allFiles])
  const imageCount = useMemo(() => allFiles.filter(i => i.mediaType === 'image').length, [allFiles])
  const files = useMemo(
    () =>
      allFiles
        .filter(i => mediaFilter === 'all' || i.mediaType === mediaFilter)
        .sort(sortFn),
    [allFiles, mediaFilter, sortFn],
  )
  const displayItems = useMemo(() => [...folders, ...files], [folders, files])

  const loadDirectory = (dir?: string, updateUrl = true) => {
    setLoading(true)
    const url = dir ? `/api/movies?dir=${encodeURIComponent(dir)}` : '/api/movies'

    setSelectedFileIndex(null)

    fetch(url)
      .then(res => res.json())
      .then(data => {
        setItems(data.items || [])
        setCurrentPath(data.currentPath || '')
        setIsHome(!!data.isHome)
        setLoading(false)

        if (updateUrl) {
          if (data.currentPath) {
            const params = new URLSearchParams()
            params.set('dir', data.currentPath)
            router.push(`?${params.toString()}`, { scroll: false })
          } else if (data.isHome) {
            router.push('?', { scroll: false })
          }
        }
      })
      .catch(err => {
        console.error('Failed to load movies:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    const dirParam = searchParams.get('dir')
    if (dirParam) {
      loadDirectory(dirParam, false)
    } else {
      loadDirectory(undefined, false)
    }
  }, [])

  const navigateToDirectory = (dirPath: string) => {
    setPathHistory([...pathHistory, currentPath])
    loadDirectory(dirPath)
  }

  const navigateBack = () => {
    if (pathHistory.length > 0) {
      const previousPath = pathHistory[pathHistory.length - 1]
      const newHistory = pathHistory.slice(0, -1)
      setPathHistory(newHistory)
      if (previousPath === '') {
        loadDirectory(undefined)
      } else {
        loadDirectory(previousPath)
      }
    }
  }

  const goHome = () => {
    setPathHistory([])
    loadDirectory(undefined)
  }

  if (selectedFileIndex !== null && files[selectedFileIndex]) {
    return (
      <MediaViewer
        items={files}
        index={selectedFileIndex}
        currentPath={currentPath}
        onNavigate={setSelectedFileIndex}
        onClose={() => setSelectedFileIndex(null)}
      />
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black p-8">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 neon-violet rounded-full blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 neon-blue rounded-full blur-3xl opacity-20 animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold title-glow mb-4 bg-gradient-to-r from-violet-400 via-purple-500 to-blue-400 bg-clip-text text-transparent">
            Angel OS
          </h1>
          <h2 className="text-3xl font-light text-gray-300 mb-2">
            {isHome ? 'Media Library' : 'Media Library'}
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-violet-500 to-blue-500 mx-auto rounded-full"></div>
        </div>

        {/* Breadcrumb / navigation bar */}
        {!isHome && (
          <div className="max-w-7xl mx-auto mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Home button */}
              <button
                onClick={goHome}
                className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors bg-gray-800/50 hover:bg-gray-800/80 px-3 py-2 rounded-lg border border-violet-500/20"
                title="Media Library home"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="text-xs hidden sm:inline">Home</span>
              </button>

              {/* Back button */}
              {pathHistory.length > 0 && (
                <button
                  onClick={navigateBack}
                  className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors bg-gray-800/50 hover:bg-gray-800/80 px-3 py-2 rounded-lg border border-violet-500/20"
                  title="Go up one level"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="text-xs hidden sm:inline">Up</span>
                </button>
              )}

              {/* Current path breadcrumb */}
              <div className="text-sm text-gray-400 bg-gray-800/30 px-4 py-2 rounded-lg border border-gray-700/50 flex-1 truncate font-mono text-xs">
                {currentPath}
              </div>
            </div>
          </div>
        )}

        {/* Home quick-access grid */}
        {isHome && !loading && (
          <div className="max-w-4xl mx-auto mb-10">
            <div className="flex items-center justify-center gap-3 mb-4">
              <h3 className="text-lg text-gray-400 tracking-widest uppercase text-xs">Quick Access</h3>
              <button
                onClick={() => setSettingsOpen(true)}
                className="text-gray-500 hover:text-violet-300 transition-colors p-1.5 rounded-lg hover:bg-gray-800/60"
                title="Configure shortcuts"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigateToDirectory(item.path)}
                  className="group relative flex flex-col items-center justify-center p-8 rounded-2xl bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-violet-500/20 hover:border-violet-400/60 hover:from-violet-900/30 hover:to-blue-900/30 transition-all duration-200"
                >
                  <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-200">
                    {item.name.split(' ')[0] || '📁'}
                  </div>
                  <span className="text-lg font-semibold text-gray-200 group-hover:text-violet-300 transition-colors text-center">
                    {item.name.replace(/^[^\s]+\s/, '')}
                  </span>
                  <span className="text-xs text-gray-500 mt-1 font-mono truncate max-w-full px-2 text-center">
                    {item.path}
                  </span>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-600/10 via-transparent to-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="neon-glow rounded-full p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-400"></div>
            </div>
          </div>
        ) : !isHome && items.length === 0 ? (
          <div className="text-center py-20">
            <div className="neon-glow rounded-2xl p-8 max-w-md mx-auto">
              <div className="text-4xl mb-4">🎬</div>
              <h3 className="text-xl text-gray-300">No items found</h3>
              <p className="text-gray-500 mt-2">Check your media directory</p>
            </div>
          </div>
        ) : !isHome ? (
          <>
            {/* Toolbar: filter · sort · thumbnail size */}
            <div className="max-w-7xl mx-auto mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Media-type filter */}
              {allFiles.length > 0 && (
                <div className="flex items-center rounded-lg border border-violet-500/20 bg-gray-800/40 p-0.5">
                  {([
                    ['all', `All (${allFiles.length})`],
                    ['video', `Videos (${videoCount})`],
                    ['image', `Images (${imageCount})`],
                  ] as [MediaFilter, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setMediaFilter(key)}
                      className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs rounded-md transition-colors ${
                        mediaFilter === key
                          ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white'
                          : 'text-gray-400 hover:text-violet-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Sort key */}
              <div className="flex items-center rounded-lg border border-violet-500/20 bg-gray-800/40 p-0.5">
                {([
                  ['name', 'Name'],
                  ['modified', 'Modified'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSortKey(key)}
                    className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs rounded-md transition-colors ${
                      sortKey === key
                        ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white'
                        : 'text-gray-400 hover:text-violet-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Sort direction */}
              <button
                onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                className="px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs rounded-lg border border-violet-500/20 bg-gray-800/40 text-gray-300 hover:text-violet-300 transition-colors"
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>

              {/* Thumbnail size */}
              <div className="flex items-center rounded-lg border border-violet-500/20 bg-gray-800/40 p-0.5 ml-auto">
                {([
                  ['sm', 'S'],
                  ['md', 'M'],
                  ['lg', 'L'],
                ] as [ThumbSize, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setThumbSize(key)}
                    className={`w-7 py-1.5 text-[11px] sm:text-xs rounded-md transition-colors ${
                      thumbSize === key
                        ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white'
                        : 'text-gray-400 hover:text-violet-300'
                    }`}
                    title={`${label === 'S' ? 'Small' : label === 'M' ? 'Medium' : 'Large'} thumbnails`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

          <div className={`grid ${GRID_COLS[thumbSize]} gap-3 sm:gap-4 lg:gap-6 max-w-7xl mx-auto`}>
            {displayItems.map((item, index) => (
              <button
                key={item.path}
                onClick={() =>
                  item.isDirectory
                    ? navigateToDirectory(item.path)
                    : setSelectedFileIndex(files.findIndex(f => f.path === item.path))
                }
                className={`movie-card group cursor-pointer flex flex-col w-full ${CARD_MAXW[thumbSize]} mx-auto`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Thumbnail or placeholder */}
                <div className="bg-gradient-to-br from-violet-900/50 to-blue-900/50 flex items-center justify-center overflow-hidden relative w-full aspect-[2/3]">
                  {item.thumbnail ? (
                    <img
                      src={`/api/thumbnail?file=${encodeURIComponent(item.thumbnail)}`}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-3xl sm:text-4xl opacity-50">
                      {item.isDirectory ? '📁' : '🎬'}
                    </div>
                  )}
                </div>

                {/* Item info */}
                <div className="p-2 sm:p-3 flex-shrink-0 flex flex-col justify-between min-h-[80px] sm:min-h-[90px]">
                  <h3 className="font-semibold text-xs sm:text-sm leading-tight mb-1 sm:mb-2 text-gray-200 group-hover:text-violet-300 transition-colors line-clamp-2">
                    {item.isDirectory
                      ? item.name
                      : item.name.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i, '')}
                  </h3>

                  <div className="flex items-center justify-between gap-1 sm:gap-2 flex-wrap">
                    {!item.isDirectory && (
                      <>
                        <span className="text-[10px] sm:text-xs text-gray-400 bg-gray-800/50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                          {(item.size / (1024 * 1024 * 1024)).toFixed(1)} GB
                        </span>
                        <span className="text-[10px] sm:text-xs bg-gradient-to-r from-violet-600 to-blue-600 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                          {item.name.split('.').pop()?.toUpperCase()}
                        </span>
                      </>
                    )}
                    {item.isDirectory && (
                      <span className="text-[10px] sm:text-xs bg-gradient-to-r from-blue-600 to-cyan-600 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                        FOLDER
                      </span>
                    )}
                  </div>
                </div>

                {/* Hover overlay */}
                <div className="play-button">
                  <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 sm:p-4">
                    {item.isDirectory ? (
                      <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    ) : (
                      <svg
                        className="w-6 h-6 sm:w-8 sm:h-8 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Subtle gradient border */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-600/20 via-transparent to-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              </button>
            ))}
          </div>
          </>
        ) : null}
      </div>

      <MediaSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={goHome}
      />
    </main>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black p-8">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 neon-violet rounded-full blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 neon-blue rounded-full blur-3xl opacity-20 animate-pulse delay-1000"></div>
        </div>
        <div className="relative z-10">
          <div className="text-center mb-8">
            <h1 className="text-6xl font-bold title-glow mb-4 bg-gradient-to-r from-violet-400 via-purple-500 to-blue-400 bg-clip-text text-transparent">
              Angel OS
            </h1>
            <h2 className="text-3xl font-light text-gray-300 mb-2">Media Library</h2>
            <div className="w-24 h-1 bg-gradient-to-r from-violet-500 to-blue-500 mx-auto rounded-full"></div>
          </div>
          <div className="flex items-center justify-center h-64">
            <div className="neon-glow rounded-full p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-400"></div>
            </div>
          </div>
        </div>
      </main>
    }>
      <MediaLibrary />
    </Suspense>
  )
}
