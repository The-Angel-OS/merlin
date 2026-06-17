'use client'

import { useRef, useEffect, useCallback } from 'react'

interface VideoPlayerProps {
  src: string
  title: string
  currentPath?: string
  onBack: () => void
}

export default function VideoPlayer({ src, title, currentPath, onBack }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleBack = useCallback(() => {
    onBack()
  }, [onBack])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [handleBack])

  const parentFolder = currentPath?.split(/[\\/]/).pop() || 'Library'
  const fileName = title.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|ts)$/i, '').split('\\').pop()

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Close button — always visible, top-right, big touch target */}
      <button
        onClick={handleBack}
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

      {/* Title bar — compact, semi-transparent, auto-hides feel */}
      <div className="relative z-10 bg-black/60 backdrop-blur-sm border-b border-white/10 px-4 py-2 flex items-center gap-3 min-h-[44px]">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-violet-400 hover:text-white transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-xs">{parentFolder}</span>
        </button>
        <div className="h-4 w-px bg-white/20" />
        <h1 className="text-sm font-medium truncate text-gray-300">{fileName}</h1>
      </div>

      {/* Video — fills remaining space */}
      <div className="flex-1 flex items-center justify-center bg-black relative">
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          autoPlay
          src={src}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  )
}
