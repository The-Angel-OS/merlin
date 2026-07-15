'use client'

import { useRef, useEffect, useCallback, useState } from 'react'

export interface ViewerItem {
  name: string
  path: string
  mediaType?: 'video' | 'image'
}

interface MediaViewerProps {
  items: ViewerItem[]
  index: number
  currentPath?: string
  /** Auto-advance to the next item when a video finishes. */
  autoAdvance?: boolean
  onNavigate: (newIndex: number) => void
  onClose: () => void
}

const VIDEO_EXT = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|ts|mpg|mpeg)$/i

/** Seconds each PHOTO holds before the slideshow advances (videos play to their end). */
const PHOTO_MS = 4500

export default function MediaViewer({
  items,
  index,
  currentPath,
  autoAdvance = true,
  onNavigate,
  onClose,
}: MediaViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // Slideshow: when playing, PHOTOS auto-advance on a timer and VIDEOS advance when
  // they finish; at the end it loops back to the start so an album plays forever.
  const [playing, setPlaying] = useState(false)

  const item = items[index]
  const hasPrev = index > 0
  const hasNext = index < items.length - 1

  const goPrev = useCallback(() => {
    if (index > 0) onNavigate(index - 1)
  }, [index, onNavigate])

  const goNext = useCallback(() => {
    if (index < items.length - 1) onNavigate(index + 1)
  }, [index, items.length, onNavigate])

  // Advance for the slideshow — loops to the first item at the end (continuous play).
  const goNextOrLoop = useCallback(() => {
    if (items.length <= 1) return
    onNavigate(index < items.length - 1 ? index + 1 : 0)
  }, [index, items.length, onNavigate])

  // Keyboard: ← prev, → next, Space play/pause slideshow, Esc/Backspace close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      } else if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, onClose])

  const curItem = items[index]
  const curIsVideo =
    curItem != null &&
    (curItem.mediaType === 'video' || (curItem.mediaType == null && VIDEO_EXT.test(curItem.name)))

  // Slideshow photo timer — only for images (videos advance via onEnded). Resets on
  // every index change, so each photo gets its full hold. Videos: the timer is idle.
  useEffect(() => {
    if (!playing || curIsVideo || items.length <= 1) return
    const t = setTimeout(goNextOrLoop, PHOTO_MS)
    return () => clearTimeout(t)
  }, [playing, curIsVideo, index, items.length, goNextOrLoop])

  if (!item) return null

  const isVideo =
    item.mediaType === 'video' || (item.mediaType == null && VIDEO_EXT.test(item.name))
  const parentFolder = currentPath?.split(/[\\/]/).pop() || 'Library'
  const fileName = item.name.replace(VIDEO_EXT, '').split(/[\\/]/).pop()

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Close button — always visible, top-right */}
      <button
        onClick={onClose}
        className="fixed top-3 right-3 z-[60] flex items-center gap-2 bg-black/70 hover:bg-violet-600/80 backdrop-blur-md text-white px-3 py-2 rounded-xl border border-white/20 hover:border-violet-400/60 transition-all duration-150 shadow-2xl group"
        title={`Back to ${parentFolder} (Esc)`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span className="text-sm font-medium hidden sm:inline group-hover:text-violet-200">
          ↑ {parentFolder}
        </span>
      </button>

      {/* Title bar */}
      <div className="relative z-10 bg-black/60 backdrop-blur-sm border-b border-white/10 px-4 py-2 flex items-center gap-3 min-h-[44px]">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-violet-400 hover:text-white transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-xs">{parentFolder}</span>
        </button>
        <div className="h-4 w-px bg-white/20" />
        <h1 className="text-sm font-medium truncate text-gray-300 flex-1">{fileName}</h1>
        {items.length > 1 && (
          <button
            onClick={() => setPlaying((p) => !p)}
            className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium border transition-all ${
              playing
                ? 'bg-violet-600/80 border-violet-400/60 text-white'
                : 'bg-black/40 border-white/15 text-gray-300 hover:text-white hover:border-violet-400/60'
            }`}
            title={playing ? 'Pause slideshow (Space)' : 'Play slideshow (Space)'}
          >
            {playing ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            <span className="hidden sm:inline">{playing ? 'Playing' : 'Play'}</span>
          </button>
        )}
        <span className="text-xs text-gray-500 shrink-0 font-mono">
          {index + 1} / {items.length}
        </span>
      </div>

      {/* Stage — fills remaining space */}
      <div className="flex-1 flex items-center justify-center bg-black relative overflow-hidden">
        {isVideo ? (
          <video
            // key forces a fresh element per item so src/autoplay reset cleanly
            key={item.path}
            ref={videoRef}
            className="max-w-full max-h-full w-auto h-auto object-contain"
            controls
            autoPlay
            src={`/api/stream?file=${encodeURIComponent(item.path)}`}
            onEnded={() => {
              // In slideshow mode, roll on (looping at the end); otherwise keep the
              // original behavior (advance only if there IS a next item).
              if (playing) goNextOrLoop()
              else if (autoAdvance && hasNext) goNext()
            }}
          >
            Your browser does not support the video tag.
          </video>
        ) : (
          <img
            key={item.path}
            src={`/api/thumbnail?file=${encodeURIComponent(item.path)}`}
            alt={item.name}
            className="max-w-full max-h-full w-auto h-auto object-contain"
          />
        )}

        {/* Prev arrow */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-violet-600/80 backdrop-blur-md text-white rounded-full p-2 sm:p-3 border border-white/15 hover:border-violet-400/60 transition-all"
            title="Previous (←)"
          >
            <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Next arrow */}
        {hasNext && (
          <button
            onClick={goNext}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-violet-600/80 backdrop-blur-md text-white rounded-full p-2 sm:p-3 border border-white/15 hover:border-violet-400/60 transition-all"
            title="Next (→)"
          >
            <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
