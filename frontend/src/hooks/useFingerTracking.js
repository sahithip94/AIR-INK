import { useEffect, useRef, useState } from 'react'
import { mapNormalizedToScreen } from '../utils/drawingUtils'
import { createOneEuroFilter, isJumpTooLarge } from '../utils/smoothing'

// MediaPipe Hands landmark index for the index fingertip.
const INDEX_FINGER_TIP = 8

// How long to keep showing the last known cursor position after tracking
// is lost before actually hiding it — MediaPipe briefly losing the hand
// for a frame or two (a blink of occlusion, a fast motion blur) is normal
// and shouldn't make the cursor vanish/reappear elsewhere; only a loss
// that outlasts this grace period is treated as "the hand is really gone".
const FREEZE_GRACE_MS = 350

// A single frame's worth of real fingertip motion essentially never
// covers this many screen pixels — a jump bigger than this is almost
// always a mis-detection, not real motion, and gets rejected outright.
const MAX_JUMP_PX = 260

// Jump-rejection only applies when we were *actively* tracking a moment
// ago. After a longer gap (a freeze, or first acquisition), the next
// position is a legitimate reacquire, not an outlier, even if it's far
// from wherever the cursor was last frozen.
const JUMP_REJECTION_WINDOW_MS = 200

/**
 * hooks/useFingerTracking.js
 *
 * Tracks the index fingertip (landmark 8) from a raw MediaPipe landmark
 * frame and maps it from normalized camera-frame coordinates to actual
 * screen pixels (accounting for the video's cover-fit crop and an inward
 * edge margin so the cursor can actually reach the screen's corners —
 * see utils/drawingUtils.mapNormalizedToScreen).
 *
 * Three layers of stabilization sit between the raw landmark and the
 * returned `position`:
 *   1. Jump rejection — a single wildly-off sample (MAX_JUMP_PX) is
 *      thrown out rather than smoothed toward, so one bad detection can't
 *      drag the cursor across the screen and back.
 *   2. A One Euro Filter (utils/smoothing.js) — adaptive smoothing that's
 *      applied while the point is still in its native 0–1 normalized
 *      scale, which is the scale its default tuning is designed around.
 *   3. Freeze-and-reacquire — if the hand disappears for less than
 *      FREEZE_GRACE_MS, the cursor holds its last position (`isFrozen`
 *      becomes true) instead of jumping to null and back; if tracking is
 *      lost longer than that, the filter resets so the next acquisition
 *      ramps in smoothly (see createOneEuroFilter's dt clamp) instead of
 *      snapping straight to the new spot.
 *
 * Does not run hand tracking itself — it's fed `landmarks` from a single
 * shared useHandTracking() call (owned by <App />) so multiple consumers
 * never spin up multiple MediaPipe instances against the same video.
 *
 * @param {import('react').RefObject<HTMLVideoElement>} videoRef
 * @param {Array<{x:number,y:number,z:number}>|null} landmarks
 */
export default function useFingerTracking(videoRef, landmarks) {
  const [position, setPosition] = useState(null)
  const [isFrozen, setIsFrozen] = useState(false)
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  const filterRef = useRef(null)
  if (!filterRef.current) {
    filterRef.current = createOneEuroFilter({ minCutoff: 1.0, beta: 0.015 })
  }
  const lastRawScreenPointRef = useRef(null)
  const lastSeenAtRef = useRef(null)

  useEffect(() => {
    const handleResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const videoEl = videoRef?.current
    const tip = landmarks?.[INDEX_FINGER_TIP]
    const now = performance.now()

    if (!videoEl || !tip) {
      const elapsedSinceSeen =
        lastSeenAtRef.current === null ? Infinity : now - lastSeenAtRef.current

      if (elapsedSinceSeen <= FREEZE_GRACE_MS) {
        // Still within the grace period — hold the last position and
        // just flag it as frozen; don't touch `position` or the filter.
        setIsFrozen(true)
        return
      }

      // Tracking has been gone long enough to treat the hand as truly
      // absent — reset everything so the next acquisition starts clean.
      filterRef.current.reset()
      lastRawScreenPointRef.current = null
      lastSeenAtRef.current = null
      setIsFrozen(false)
      setPosition(null)
      return
    }

    const rawScreenPoint = mapNormalizedToScreen(tip, videoEl, viewport)
    const wasRecentlyTracking =
      lastSeenAtRef.current !== null && now - lastSeenAtRef.current <= JUMP_REJECTION_WINDOW_MS

    if (
      wasRecentlyTracking &&
      isJumpTooLarge(lastRawScreenPointRef.current, rawScreenPoint, MAX_JUMP_PX)
    ) {
      // Outlier sample — likely a mis-detection. Keep showing the current
      // position and don't feed this into the filter, but do count the
      // hand as "seen" so a run of good frames right after doesn't get
      // mistaken for a tracking loss.
      lastSeenAtRef.current = now
      return
    }

    lastSeenAtRef.current = now
    lastRawScreenPointRef.current = rawScreenPoint
    setIsFrozen(false)

    const smoothedNormalized = filterRef.current.filter(tip)
    const screenPoint = mapNormalizedToScreen(smoothedNormalized, videoEl, viewport)
    setPosition(screenPoint)
  }, [landmarks, videoRef, viewport])

  return {
    position, // { x, y } in screen pixels, or null when no hand has ever been seen
    isHandPresent: Boolean(position),
    isFrozen, // true while holding the last position through a brief tracking loss
  }
}
