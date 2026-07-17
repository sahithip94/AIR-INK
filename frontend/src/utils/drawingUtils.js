/**
 * utils/drawingUtils.js
 *
 * Pure, framework-agnostic helpers for turning fingertip positions into
 * rendered ink: camera-to-screen coordinate mapping, smooth SVG path
 * generation, and erasing. Kept separate from React state so
 * useDrawing.js / useFingerTracking.js only decide *when* to call these,
 * not *how* the math works.
 */

/**
 * Reproduces the `object-fit: cover` transform <WebcamView /> applies to
 * the raw camera frame: the frame is scaled up until it fills the
 * viewport in both directions, then centered, so whichever axis
 * overflows gets symmetrically cropped. Landmarks need this same
 * transform applied before they land on the visible pixels.
 */
export function getCoverTransform(videoEl, viewport) {
  const videoW = videoEl?.videoWidth
  const videoH = videoEl?.videoHeight

  if (!videoW || !videoH || !viewport?.width || !viewport?.height) {
    return null
  }

  const scale = Math.max(viewport.width / videoW, viewport.height / videoH)
  const displayW = videoW * scale
  const displayH = videoH * scale

  return {
    scale,
    displayW,
    displayH,
    offsetX: (viewport.width - displayW) / 2,
    offsetY: (viewport.height - displayH) / 2,
  }
}

/**
 * Maps one normalized MediaPipe point ({x, y} in [0, 1], relative to the
 * raw camera frame) to actual screen pixels: accounts for the cover-fit
 * crop above, then mirrors it horizontally.
 *
 * This intentionally does *not* apply any inward margin/inset to the
 * point before mapping it. An earlier version did — insetting the usable
 * range so the fingertip only needed to get close to (not exactly at)
 * the camera frame's true edge to reach the screen's edge, since
 * MediaPipe's own detection confidence drops sharply right at the true
 * boundary. But the <video> element is rendered by the browser directly
 * from the raw, unmodified camera pixels — it was never stretched the
 * same way. So every landmark computed through that inset was pushed
 * outward from center relative to where the real hand actually sits in
 * the video, growing worse the farther a point was from center — which
 * is what made the whole skeleton visibly drift to one side of the real
 * hand instead of tracking it exactly. Precision on the hand itself
 * matters more than literal corner-reachability, so this function now
 * maps 1:1 with the video's true pixels; if the far edges of the frame
 * become hard to reach for UI hit-testing again, that's a narrower
 * problem worth solving separately (e.g. only for cursor hit-testing
 * against toolbar controls) rather than distorting every mapped point.
 *
 * The mirror step matters on its own: <WebcamView />'s video is
 * displayed mirrored (`scaleX(-1)`) so it behaves like a mirror the user
 * is looking into. Without correcting for that here, this function would
 * return the *raw, unmirrored* position — correct for the camera frame,
 * but not for what the user actually sees on screen, which is also what
 * real DOM elements like <ColorPalette />'s buttons live in
 * (`getBoundingClientRect`, always in true, unmirrored screen space).
 */
export function mapNormalizedToScreen(point, videoEl, viewport) {
  if (!point || !viewport?.width || !viewport?.height) return null

  const transform = getCoverTransform(videoEl, viewport)

  const rawX = transform
    ? transform.offsetX + point.x * transform.displayW
    : point.x * viewport.width
  const y = transform
    ? transform.offsetY + point.y * transform.displayH
    : point.y * viewport.height

  return { x: viewport.width - rawX, y }
}

/**
 * Builds a smooth SVG path string through a series of points using
 * quadratic curves between successive midpoints, instead of straight `L`
 * segments between raw points. This is what turns a run of jittery
 * fingertip samples into a continuous curve rather than a disconnected
 * dot-to-dot line.
 */
export function getSmoothPathD(points) {
  if (!points || points.length === 0) return ''

  if (points.length === 1) {
    const [p] = points
    return `M ${p.x} ${p.y} L ${p.x} ${p.y}`
  }

  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const curr = points[i]
    const next = points[i + 1]
    const midX = (curr.x + next.x) / 2
    const midY = (curr.y + next.y) / 2
    d += ` Q ${curr.x} ${curr.y} ${midX} ${midY}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

/**
 * Extends a smooth path by exactly one new point, without recomputing
 * the whole curve from scratch — the incremental counterpart to
 * getSmoothPathD above.
 *
 * getSmoothPathD is correct but O(n): called on every new point of a
 * stroke that's still growing (as useDrawing does while actively
 * drawing), that's O(n) work n times over the life of one stroke —
 * O(n²) total, and it shows: a stroke felt smooth for the first second
 * and then visibly started hanging the longer it went on, since it was
 * re-walking and re-stringifying every prior point on every single
 * frame just to add one more.
 *
 * `basePath` holds every finalized "M"/"Q" segment except the very last
 * point, which always trails with an "L" (see getSmoothPathD). Each new
 * point turns the *previous* final point into an interior point (adding
 * exactly one "Q" segment to basePath) and becomes the new final point
 * (new trailing "L") — O(1) per point, however long the stroke gets.
 *
 * @param {{x:number,y:number}[]} priorPoints - the stroke's points *before* newPoint
 * @param {string} priorBasePath - the basePath returned by the previous call (or '' for a brand-new stroke)
 * @param {{x:number,y:number}} newPoint
 * @returns {{ basePath: string, d: string }}
 */
export function extendSmoothPath(priorPoints, priorBasePath, newPoint) {
  const n = priorPoints.length

  if (n === 0) {
    const basePath = `M ${newPoint.x} ${newPoint.y}`
    return { basePath, d: `${basePath} L ${newPoint.x} ${newPoint.y}` }
  }

  if (n === 1) {
    // Not enough points yet for a midpoint segment — same as
    // getSmoothPathD's length-2 special case.
    return { basePath: priorBasePath, d: `${priorBasePath} L ${newPoint.x} ${newPoint.y}` }
  }

  const prevLast = priorPoints[n - 1]
  const midX = (prevLast.x + newPoint.x) / 2
  const midY = (prevLast.y + newPoint.y) / 2
  const basePath = `${priorBasePath} Q ${prevLast.x} ${prevLast.y} ${midX} ${midY}`
  return { basePath, d: `${basePath} L ${newPoint.x} ${newPoint.y}` }
}

/**
 * Removes any stroke segment within `radius` of `point`. When the erased
 * region falls in the middle of a stroke, the stroke is split into two
 * separate fragments rather than deleted outright — a local "scratch
 * out", not an all-or-nothing wipe. Fragments left with fewer than 2
 * points (too short to draw a line) are dropped.
 *
 * Each surviving fragment gets a freshly computed `d` (SVG path string)
 * right away, since its point set is new — carrying over the original
 * stroke's cached `d` via a naive spread would leave it pointing at ink
 * that no longer exists.
 */
export function eraseAtPoint(strokes, point, radius) {
  if (!point || !strokes?.length) return strokes ?? []

  const result = []

  strokes.forEach((stroke, strokeIndex) => {
    // Cheap early exit: if nothing in this stroke is even close to the
    // erase point, pass it through untouched — no new objects, no path
    // recompute. Without this, erasing would pay the cost of rebuilding
    // every stroke on the canvas on every single frame it's active,
    // instead of just the one or two strokes actually under the cursor.
    const isTouched = stroke.points.some(
      (p) => Math.hypot(p.x - point.x, p.y - point.y) <= radius,
    )
    if (!isTouched) {
      result.push(stroke)
      return
    }

    let current = []
    let fragmentIndex = 0

    const pushFragment = (points) => {
      fragmentIndex += 1
      result.push({
        ...stroke,
        id: `${stroke.id}-frag${strokeIndex}-${fragmentIndex}`,
        points,
        d: getSmoothPathD(points),
      })
    }

    stroke.points.forEach((p) => {
      const dist = Math.hypot(p.x - point.x, p.y - point.y)
      if (dist > radius) {
        current.push(p)
        return
      }
      if (current.length > 1) {
        pushFragment(current)
      }
      current = []
    })

    if (current.length > 1) {
      pushFragment(current)
    }
  })

  return result
}

/** Creates a fresh, empty stroke ready to receive points. */
export function createStroke({ color, size, isHighlighter = false }) {
  return {
    id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    color,
    size,
    isHighlighter,
    points: [],
    basePath: '', // built up incrementally by extendSmoothPath as points come in
    d: '',
  }
}
