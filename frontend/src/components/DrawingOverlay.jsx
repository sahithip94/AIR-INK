import { useEffect, useState } from 'react'
import { getSmoothPathD, mapNormalizedToScreen } from '../utils/drawingUtils'
import { GESTURE_TYPES } from '../constants/gestures'
import '../styles/drawingOverlay.css'

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// Landmark index ranges MediaPipe uses for each digit, so the skeleton can
// be colored per-finger instead of one flat color.
const FINGER_RANGES = {
  thumb: [1, 4],
  index: [5, 8],
  middle: [9, 12],
  ring: [13, 16],
  pinky: [17, 20],
}

function getFingerName(startIdx, endIdx) {
  for (const [finger, [min, max]] of Object.entries(FINGER_RANGES)) {
    if (
      (startIdx >= min && startIdx <= max) ||
      (endIdx >= min && endIdx <= max)
    ) {
      return finger
    }
  }
  return 'palm'
}

const HOVER_RING_CIRCUMFERENCE = 2 * Math.PI * 16

/**
 * DrawingOverlay
 *
 * Full-screen transparent layer stacked exactly on top of <WebcamView />.
 * Renders everything that lives "on top of the camera feed":
 *   - the 21 hand landmarks + skeleton connections (still tracking above the webcam)
 *   - every finished ink stroke, plus the one currently being drawn
 *   - the fingertip cursor itself, styled per active gesture
 *   - the color-selection hover progress ring, while Cursor Mode is dwelling on a swatch
 *
 * All hand tracking, drawing, and gesture state is computed elsewhere
 * (useHandTracking / useFingerTracking / useDrawing / useGestures, wired
 * together in <App />) — this component only turns that data into pixels.
 * Renders nothing when no hand is currently detected.
 *
 * MediaPipe's landmark coordinates are normalized to the raw camera
 * frame, not to the screen. Since <WebcamView /> displays that frame with
 * `object-fit: cover`, the visible image is cropped whenever the frame's
 * aspect ratio doesn't match the viewport's — `mapNormalizedToScreen`
 * (shared with useFingerTracking, imported from utils/drawingUtils)
 * reproduces that same cover-fit math, plus an inward edge margin so the
 * cursor can actually reach the screen's corners, so everything lines up
 * with the visible pixels instead of the raw, uncropped frame. Ink
 * strokes are already in screen-space by the time they get here
 * (useFingerTracking maps the fingertip the same way before useDrawing
 * ever records a point), so they need no further transform.
 *
 * @param {{
 *   videoRef: import('react').RefObject<HTMLVideoElement>,
 *   landmarks: Array<{x:number,y:number,z:number}>|null,
 *   connections: Iterable<[number, number]>,
 *   cursorPosition: {x:number,y:number}|null,
 *   isHandPresent: boolean,
 *   isFrozen: boolean,
 *   activeGesture: string|null,
 *   isOverToolbar: boolean,
 *   strokes: Array<{id:string,color:string,size:number,isHighlighter:boolean,points:{x:number,y:number}[]}>,
 *   currentStroke: {id:string,color:string,size:number,isHighlighter:boolean,points:{x:number,y:number}[]}|null,
 *   color: string,
 *   brushSize: number,
 *   hoverProgress: number,
 * }} props
 */
export default function DrawingOverlay({
  videoRef,
  landmarks,
  connections,
  cursorPosition,
  isHandPresent,
  isFrozen = false,
  activeGesture,
  isOverToolbar = false,
  strokes = [],
  currentStroke,
  color,
  brushSize,
  hoverProgress = 0,
}) {
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  useEffect(() => {
    const handleResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const videoEl = videoRef?.current

  const screenPoints = landmarks
    ? landmarks.map((point) => mapNormalizedToScreen(point, videoEl, viewport))
    : null

  // Wrist (0) to middle-knuckle (9) distance as a stand-in for "how big is
  // this hand on screen right now" — everything else scales off of it, so
  // the skeleton stays proportional whether the hand is close or far away.
  let boneWidth = 4
  let jointRadius = 5
  let tipRadius = 8
  if (screenPoints) {
    const wrist = screenPoints[0]
    const middleKnuckle = screenPoints[9]
    const handSpan =
      wrist && middleKnuckle
        ? Math.hypot(middleKnuckle.x - wrist.x, middleKnuckle.y - wrist.y)
        : 60
    boneWidth = clamp(handSpan * 0.05, 2.5, 9)
    jointRadius = clamp(handSpan * 0.09, 3, 11)
    tipRadius = clamp(handSpan * 0.15, 5, 18)
  }

  const isDrawMode = activeGesture === GESTURE_TYPES.DRAW
  const isEraserMode = activeGesture === GESTURE_TYPES.ERASER
  const isCursorMode = activeGesture === GESTURE_TYPES.CURSOR
  const isDrawWithheld = isDrawMode && isOverToolbar
  const eraserRadius = brushSize * 2.2
  const cursorModeClass = (activeGesture || 'idle').toLowerCase()

  return (
    <div className="drawing-overlay" aria-hidden="true">
      <svg
        className="drawing-overlay__skeleton"
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      >
        {/* --- Finished ink strokes + the one currently being drawn --- */}
        <g className="drawing-overlay__strokes">
          {strokes.map((stroke) => (
            <path
              key={stroke.id}
              d={stroke.d ?? getSmoothPathD(stroke.points)}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.size}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={stroke.isHighlighter ? 0.4 : 1}
            />
          ))}
          {currentStroke && currentStroke.points.length > 0 && (
            <path
              d={currentStroke.d}
              fill="none"
              stroke={currentStroke.color}
              strokeWidth={currentStroke.size}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={currentStroke.isHighlighter ? 0.4 : 1}
            />
          )}
        </g>

        {/* --- Hand skeleton --- */}
        {screenPoints && (
          <g className="drawing-overlay__hand">
            {Array.from(connections ?? []).map(([startIdx, endIdx], i) => {
              const a = screenPoints[startIdx]
              const b = screenPoints[endIdx]
              if (!a || !b) return null
              return (
                <line
                  key={`bone-${startIdx}-${endIdx}-${i}`}
                  className={`drawing-overlay__bone drawing-overlay__bone--${getFingerName(
                    startIdx,
                    endIdx,
                  )}`}
                  style={{ strokeWidth: boneWidth }}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              )
            })}

            {screenPoints.map((point, i) => {
              const isTip = i === 8
              return (
                <circle
                  key={`joint-${i}`}
                  className={`drawing-overlay__joint${
                    isTip ? ' drawing-overlay__joint--tip' : ''
                  }`}
                  cx={point.x}
                  cy={point.y}
                  r={isTip ? tipRadius : jointRadius}
                />
              )
            })}
          </g>
        )}

        {/* --- Fingertip cursor: hidden whenever no hand has ever been seen --- */}
        {isHandPresent && cursorPosition && (
          <g
            className={`drawing-overlay__cursor drawing-overlay__cursor--${cursorModeClass}${
              isFrozen ? ' drawing-overlay__cursor--frozen' : ''
            }${isDrawWithheld ? ' drawing-overlay__cursor--withheld' : ''}`}
          >
            {isFrozen && (
              <circle
                className="drawing-overlay__freeze-ring"
                cx={cursorPosition.x}
                cy={cursorPosition.y}
                r={14}
              />
            )}

            {isEraserMode && (
              <circle
                className="drawing-overlay__eraser-ring"
                cx={cursorPosition.x}
                cy={cursorPosition.y}
                r={eraserRadius}
              />
            )}

            <circle
              className="drawing-overlay__cursor-dot"
              cx={cursorPosition.x}
              cy={cursorPosition.y}
              r={isDrawMode ? Math.max(brushSize / 2, 5) : 8}
              style={isDrawMode && !isDrawWithheld ? { fill: color } : undefined}
            />

            {isCursorMode && hoverProgress > 0 && (
              <circle
                className="drawing-overlay__hover-ring"
                cx={cursorPosition.x}
                cy={cursorPosition.y}
                r={16}
                style={{
                  strokeDasharray: HOVER_RING_CIRCUMFERENCE,
                  strokeDashoffset: HOVER_RING_CIRCUMFERENCE * (1 - hoverProgress),
                }}
              />
            )}
          </g>
        )}
      </svg>
    </div>
  )
}
