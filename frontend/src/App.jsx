import { useRef, useState } from 'react'
import useHandTracking from './hooks/useHandTracking'
import useFingerTracking from './hooks/useFingerTracking'
import useGestures from './hooks/useGestures'
import useDrawing from './hooks/useDrawing'
import WebcamView from './components/WebcamView'
import DrawingOverlay from './components/DrawingOverlay'
import ColorPalette from './components/ColorPalette'
import Instructions from './components/Instructions'
import './App.css'

/**
 * App
 *
 * Composition root only: creates the shared video ref, calls each
 * tracking/drawing hook exactly once, and passes the results down as
 * props. No MediaPipe, gesture, or drawing logic lives here — that all
 * lives in the hooks themselves (useHandTracking, useFingerTracking,
 * useGestures, useDrawing) and their supporting utils.
 *
 * useHandTracking is deliberately called here — and only here — so every
 * consumer (finger tracking, gestures, the overlay) shares one MediaPipe
 * instance and one video ref instead of each spinning up its own.
 */
function App() {
  const videoRef = useRef(null)
  const toolbarRef = useRef(null)

  const { landmarks, connections } = useHandTracking(videoRef)
  const { position: cursorPosition, isHandPresent, isFrozen } = useFingerTracking(
    videoRef,
    landmarks,
  )
  const { activeGesture, isPinching } = useGestures(landmarks)

  // Plain geometry, not gesture/drawing logic: is the cursor currently
  // over the toolbar's real screen rect? Computed inline (not in state)
  // since App already re-renders on every cursor update, and this is a
  // cheap synchronous check — no need for its own effect. useDrawing uses
  // this to withhold Draw Mode while the cursor is over the palette, so
  // reaching for a color doesn't leave an accidental line behind it.
  const isOverToolbar = (() => {
    if (!cursorPosition || !toolbarRef.current) return false
    const rect = toolbarRef.current.getBoundingClientRect()
    const margin = 12 // a little breathing room around the panel's edge
    return (
      cursorPosition.x >= rect.left - margin &&
      cursorPosition.x <= rect.right + margin &&
      cursorPosition.y >= rect.top - margin &&
      cursorPosition.y <= rect.bottom + margin
    )
  })()

  const {
    strokes,
    currentStroke,
    color,
    setColor,
    brushSize,
    setBrushSize,
    isHighlighter,
    toggleHighlighter,
  } = useDrawing({ cursorPosition, activeGesture, isOverToolbar })

  // Trivial relay state so <ColorPalette />'s hover-dwell detection (it
  // owns the swatch DOM refs) can hand its progress to <DrawingOverlay />
  // (which renders the ring around the cursor) — no gesture/drawing logic
  // here, just passing a number and a name between two sibling components.
  const [hoverProgress, setHoverProgress] = useState(0)

  return (
    <div className="app">
      <WebcamView videoRef={videoRef} />

      <DrawingOverlay
        videoRef={videoRef}
        landmarks={landmarks}
        connections={connections}
        cursorPosition={cursorPosition}
        isHandPresent={isHandPresent}
        isFrozen={isFrozen}
        activeGesture={activeGesture}
        isOverToolbar={isOverToolbar}
        strokes={strokes}
        currentStroke={currentStroke}
        color={color.value}
        brushSize={brushSize}
        hoverProgress={hoverProgress}
      />

      <div className="app__brand">
        <h1 className="app__brand-name">
          AirInk
          <svg
            className="app__brand-underline"
            viewBox="0 0 148 14"
            aria-hidden="true"
          >
            <path
              d="M2 8.5C22 3, 44 3, 62 7 C 84 11.5, 108 2, 146 6.5"
              fill="none"
              stroke="var(--accent-hot-pink)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
        </h1>
        <span className="app__brand-spark" aria-hidden="true">✦</span>
      </div>

      <div className="app__panel app__panel--top-right">
        <Instructions />
      </div>

      <div className="app__panel app__panel--bottom-left" ref={toolbarRef}>
        <ColorPalette
          activeGesture={activeGesture}
          cursorPosition={cursorPosition}
          isPinching={isPinching}
          selectedColor={color}
          onSelectColor={setColor}
          brushSize={brushSize}
          onSelectSize={setBrushSize}
          isHighlighter={isHighlighter}
          onToggleHighlighter={toggleHighlighter}
          onHoverChange={setHoverProgress}
        />
      </div>
    </div>
  )
}

export default App
