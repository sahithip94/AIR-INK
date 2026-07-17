import { useEffect, useRef, useState } from 'react'
import { GESTURE_TYPES } from '../constants/gestures'
import '../styles/colorPalette.css'

const COLORS = [
  { name: 'Black', value: '#0B0D12' },
  { name: 'White', value: '#F5F7FA' },
  { name: 'Red', value: '#FF4D4D' },
  { name: 'Blue', value: '#3D8BFF' },
  { name: 'Green', value: '#3DDC84' },
  { name: 'Yellow', value: '#FFD84D' },
  { name: 'Purple', value: '#A45DFF' },
  { name: 'Orange', value: '#FF9142' },
]

const SIZES = [
  { name: 'Small', px: 9 },
  { name: 'Medium', px: 15 },
  { name: 'Large', px: 23 },
]

// A single flat list of everything that can be hover-selected — every
// color swatch, every brush-size dot, AND the pen/highlighter toggle —
// so one dwell-timer/hit-test loop drives all of them, instead of
// duplicating the same timing logic three times.
const HOVER_TARGETS = [
  ...COLORS.map((c) => ({ key: `color:${c.name}`, kind: 'color', data: c })),
  ...SIZES.map((s) => ({ key: `size:${s.name}`, kind: 'size', data: s })),
  { key: 'highlighter', kind: 'highlighter', data: null },
]

const HOVER_SELECT_MS = 400
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 16 // matches the r=16 circle below

function HoverProgressRing({ progress }) {
  return (
    <svg className="hover-progress" viewBox="0 0 36 36" aria-hidden="true">
      <circle className="hover-progress__track" cx="18" cy="18" r="16" />
      <circle
        className="hover-progress__fill"
        cx="18"
        cy="18"
        r="16"
        style={{
          strokeDasharray: PROGRESS_RING_CIRCUMFERENCE,
          strokeDashoffset: PROGRESS_RING_CIRCUMFERENCE * (1 - progress),
        }}
      />
    </svg>
  )
}

/**
 * ColorPalette
 *
 * Floating pen controls anchored to the bottom-left corner: ink color,
 * brush size, and a pen/highlighter toggle. Color/size/highlighter are
 * controlled from <App /> (backed by useDrawing) — this component only
 * renders them and reports selections back up via callback props.
 *
 * Color, brush size, AND the pen/highlighter toggle are all hover-driven,
 * not just clickable — the whole point of AirInk is controlling
 * everything with a mid-air fingertip, so a control that only responds
 * to a mouse click isn't actually usable hands-free. Hold the cursor over
 * a swatch, a size dot, or the highlighter toggle for ~400ms while in
 * Cursor Mode and it activates, with a progress ring filling in as
 * feedback — or pinch (thumb + index touching) to select whatever's
 * currently hovered instantly, without waiting out the timer. It's
 * intentionally gated behind Cursor Mode (not Draw/Eraser) so a stray
 * fingertip pass over the palette can't change anything by accident.
 * Mouse clicks still work too, for testing without a camera.
 *
 * @param {{
 *   activeGesture: string|null,
 *   cursorPosition: {x:number,y:number}|null,
 *   isPinching?: boolean,
 *   selectedColor: {name:string,value:string},
 *   onSelectColor: (color: {name:string,value:string}) => void,
 *   brushSize: number,
 *   onSelectSize: (px: number) => void,
 *   isHighlighter: boolean,
 *   onToggleHighlighter: () => void,
 *   onHoverChange?: (progress: number, key: string|null) => void,
 * }} props
 */
export default function ColorPalette({
  activeGesture,
  cursorPosition,
  isPinching = false,
  selectedColor,
  onSelectColor,
  brushSize,
  onSelectSize,
  isHighlighter,
  onToggleHighlighter,
  onHoverChange,
}) {
  const targetRefs = useRef({})
  const hoveredKeyRef = useRef(null)
  const hoverStartRef = useRef(null)
  const [hover, setHover] = useState({ key: null, progress: 0 })

  const isCursorModeActive = activeGesture === GESTURE_TYPES.CURSOR

  const resetHover = (report = true) => {
    hoveredKeyRef.current = null
    hoverStartRef.current = null
    setHover({ key: null, progress: 0 })
    if (report) onHoverChange?.(0, null)
  }

  useEffect(() => {
    // Hover-selection only works while Cursor Mode is active — Draw and
    // Eraser mode fingertip movement should never brush past a control
    // and accidentally change it.
    if (!isCursorModeActive || !cursorPosition) {
      if (hoveredKeyRef.current) resetHover()
      return
    }

    let hit = null
    for (const target of HOVER_TARGETS) {
      const el = targetRefs.current[target.key]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const radius = rect.width / 2 + 6 // small forgiveness margin
      if (Math.hypot(cursorPosition.x - cx, cursorPosition.y - cy) <= radius) {
        hit = target
        break
      }
    }

    if (!hit) {
      if (hoveredKeyRef.current) resetHover()
      return
    }

    if (hoveredKeyRef.current !== hit.key) {
      hoveredKeyRef.current = hit.key
      hoverStartRef.current = performance.now()
    }

    const elapsed = performance.now() - hoverStartRef.current
    const progress = Math.min(elapsed / HOVER_SELECT_MS, 1)
    setHover({ key: hit.key, progress })
    onHoverChange?.(progress, hit.key)

    // A pinch selects whatever's currently hovered immediately, without
    // waiting out the dwell timer — the fast path alongside dwell-time
    // selection, for when the person wants to commit right away.
    if (progress >= 1 || isPinching) {
      if (hit.kind === 'color') onSelectColor(hit.data)
      else if (hit.kind === 'size') onSelectSize(hit.data.px)
      else if (hit.kind === 'highlighter') onToggleHighlighter()
      resetHover()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorPosition, isCursorModeActive, isPinching])

  return (
    <div className="color-palette">
      <span className="color-palette__label">Ink</span>
      <div className="color-palette__grid">
        {COLORS.map((c) => {
          const key = `color:${c.name}`
          const isSelected = selectedColor?.name === c.name
          const isHovering = hover.key === key

          return (
            <button
              key={c.name}
              ref={(el) => {
                targetRefs.current[key] = el
              }}
              type="button"
              className={`color-swatch${isSelected ? ' color-swatch--selected' : ''}${
                isHovering ? ' color-swatch--hovering' : ''
              }`}
              style={{ '--swatch-color': c.value }}
              onClick={() => onSelectColor(c)}
              aria-pressed={isSelected}
              aria-label={c.name}
              title={c.name}
            >
              {isHovering && <HoverProgressRing progress={hover.progress} />}
            </button>
          )
        })}
      </div>

      <span className="color-palette__label">Size</span>
      <div className="brush-size">
        {SIZES.map((size) => {
          const key = `size:${size.name}`
          const isSelected = brushSize === size.px
          const isHovering = hover.key === key

          return (
            <button
              key={size.name}
              ref={(el) => {
                targetRefs.current[key] = el
              }}
              type="button"
              className={`brush-dot${isSelected ? ' brush-dot--selected' : ''}${
                isHovering ? ' brush-dot--hovering' : ''
              }`}
              style={{ '--dot-size': `${size.px}px`, '--dot-color': selectedColor?.value }}
              onClick={() => onSelectSize(size.px)}
              aria-pressed={isSelected}
              aria-label={`${size.name} brush size`}
              title={size.name}
            >
              <span className="brush-dot__circle" />
              {isHovering && <HoverProgressRing progress={hover.progress} />}
            </button>
          )
        })}
      </div>

      <button
        ref={(el) => {
          targetRefs.current.highlighter = el
        }}
        type="button"
        className={`highlighter-toggle${isHighlighter ? ' highlighter-toggle--active' : ''}${
          hover.key === 'highlighter' ? ' highlighter-toggle--hovering' : ''
        }`}
        onClick={onToggleHighlighter}
        aria-pressed={isHighlighter}
      >
        <span className="highlighter-toggle__icon" aria-hidden="true">
          {isHighlighter ? '🖍️' : '✏️'}
        </span>
        <span className="highlighter-toggle__label">
          {isHighlighter ? 'Highlighter' : 'Pen'}
        </span>
        {hover.key === 'highlighter' && <HoverProgressRing progress={hover.progress} />}
      </button>
    </div>
  )
}
