import { useCallback, useEffect, useRef, useState } from 'react'
import { createStroke, eraseAtPoint, extendSmoothPath } from '../utils/drawingUtils'
import { GESTURE_TYPES } from '../constants/gestures'

const DEFAULT_COLOR = { name: 'Black', value: '#0B0D12' }
const DEFAULT_BRUSH_SIZE = 15 // px — matches <ColorPalette />'s "Medium" size
const ERASER_RADIUS_MULTIPLIER = 2.2 // how much bigger the eraser is than the pen at the same "size"

/**
 * hooks/useDrawing.js
 *
 * Owns the drawing canvas's actual state: finished strokes, the stroke
 * currently being drawn, the selected color/brush size/highlighter tool,
 * and clearCanvas(). Reacts to the fingertip position (from
 * useFingerTracking) and the active gesture (from useGestures) to decide
 * what to do each frame:
 *   - DRAW + a fingertip position  -> extend (or start) the current stroke
 *   - anything else while a stroke is in progress -> commit it to `strokes`
 *   - ERASER + a fingertip position -> erase nearby ink
 *   - CLEAR_CANVAS (on the rising edge only, not held) -> wipe the canvas
 *
 * Brush color/size/highlighter live here (not in <ColorPalette />) since
 * they're drawing state, not UI state — <ColorPalette /> just renders
 * controls for them via props from <App />.
 *
 * @param {{
 *   cursorPosition: {x:number,y:number}|null,
 *   activeGesture: string|null,
 *   isOverToolbar?: boolean,
 * }} params
 */
export default function useDrawing({ cursorPosition, activeGesture, isOverToolbar = false }) {
  const [strokes, setStrokes] = useState([])
  const [currentStroke, setCurrentStroke] = useState(null)
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE)
  const [isHighlighter, setIsHighlighter] = useState(false)

  // Mirrors state in refs so the frame-by-frame effect below always reads
  // the latest values without having to re-subscribe on every change.
  const currentStrokeRef = useRef(null)
  const previousGestureRef = useRef(null)
  const colorRef = useRef(color)
  const brushSizeRef = useRef(brushSize)
  const isHighlighterRef = useRef(isHighlighter)

  useEffect(() => {
    colorRef.current = color
  }, [color])
  useEffect(() => {
    brushSizeRef.current = brushSize
  }, [brushSize])
  useEffect(() => {
    isHighlighterRef.current = isHighlighter
  }, [isHighlighter])

  // Every piece of state that can hold ink lives right here — there's no
  // separate canvas bitmap, mask, or off-screen buffer elsewhere in the
  // app (rendering is plain SVG driven straight from `strokes` in
  // <DrawingOverlay />, not a persistent <canvas> pixel buffer that could
  // retain stale pixels of its own). So resetting these three is a
  // complete wipe, not a partial one: `strokes` (every finished stroke,
  // including any fragments left behind by prior erasing), `currentStroke`
  // (the stroke actively being drawn, if any), and the ref that mirrors
  // it for the frame-by-frame effect below.
  const clearCanvas = useCallback(() => {
    setStrokes([])
    setCurrentStroke(null)
    currentStrokeRef.current = null
  }, [])

  const toggleHighlighter = useCallback(() => {
    setIsHighlighter((prev) => !prev)
  }, [])

  useEffect(() => {
    const previousGesture = previousGestureRef.current
    previousGestureRef.current = activeGesture

    // --- Clear canvas: fire once on the rising edge, not every frame
    //     the thumbs-up pose is held. ---
    if (
      activeGesture === GESTURE_TYPES.CLEAR_CANVAS &&
      previousGesture !== GESTURE_TYPES.CLEAR_CANVAS
    ) {
      clearCanvas()
      return
    }

    // --- Draw mode: extend the in-progress stroke ---
    // Withheld while the cursor is over the toolbar — reaching for a
    // color or size control while still in Draw Mode (☝️) used to leave
    // an accidental line trailing across/into the palette. This falls
    // through to the "leaving draw mode" branch below, which commits
    // whatever was already drawn rather than discarding it.
    if (activeGesture === GESTURE_TYPES.DRAW && cursorPosition && !isOverToolbar) {
      if (!currentStrokeRef.current) {
        const stroke = createStroke({
          color: colorRef.current.value,
          size: brushSizeRef.current,
          isHighlighter: isHighlighterRef.current,
        })
        const { basePath, d } = extendSmoothPath(stroke.points, stroke.basePath, cursorPosition)
        stroke.points.push(cursorPosition)
        stroke.basePath = basePath
        stroke.d = d
        currentStrokeRef.current = stroke
        setCurrentStroke({ ...stroke })
      } else {
        // Mutating `points` in place (rather than `[...points, cursorPosition]`)
        // and extending the cached path by just the one new point (rather
        // than rebuilding it from every point every frame) is what keeps
        // this O(1) per frame no matter how long the stroke has gotten —
        // see extendSmoothPath's doc comment for why that matters.
        const stroke = currentStrokeRef.current
        const { basePath, d } = extendSmoothPath(stroke.points, stroke.basePath, cursorPosition)
        stroke.points.push(cursorPosition)
        stroke.basePath = basePath
        stroke.d = d
        setCurrentStroke({ ...stroke })
      }
      return
    }

    // --- Leaving draw mode: commit whatever stroke was in progress ---
    if (currentStrokeRef.current) {
      const finished = currentStrokeRef.current
      currentStrokeRef.current = null
      setCurrentStroke(null)
      // A single-point "tap" is still a deliberate mark (renders as a dot,
      // since extendSmoothPath's zero-length line + round linecap draws
      // as a filled circle) — only truly empty strokes get discarded.
      // `finished.d` is already correct and up to date — it was built
      // incrementally as each point came in, so there's no need to
      // recompute it here.
      if (finished.points.length >= 1) {
        setStrokes((prev) => [...prev, finished])
      }
    }

    // --- Eraser mode: remove ink near the fingertip ---
    if (activeGesture === GESTURE_TYPES.ERASER && cursorPosition) {
      const radius = brushSizeRef.current * ERASER_RADIUS_MULTIPLIER
      setStrokes((prev) => eraseAtPoint(prev, cursorPosition, radius))
    }
  }, [activeGesture, cursorPosition, isOverToolbar, clearCanvas])

  return {
    strokes,
    currentStroke,
    color,
    setColor,
    brushSize,
    setBrushSize,
    isHighlighter,
    setIsHighlighter,
    toggleHighlighter,
    clearCanvas,
  }
}
