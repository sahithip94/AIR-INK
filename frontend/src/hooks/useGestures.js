import { useEffect, useRef, useState } from 'react'
import { classifyGesture, isPinching as isPinchingPose } from '../utils/gestureUtils'
import { createModeSmoother } from '../utils/smoothing'

// Pinch is meant to feel like an instant "click", not a mode you have to
// hold — so it only needs a couple of consecutive confirming frames
// (enough to filter out a single noisy frame) rather than the full
// 5-frame debounce used for the sustained hand poses below.
const PINCH_CONFIRM_FRAMES = 2

/**
 * hooks/useGestures.js
 *
 * Turns raw per-frame hand landmarks into a stable, high-level gesture:
 * DRAW (☝️), CURSOR (✌️), CLEAR_CANVAS (👍), or ERASER (✊). Per-frame
 * pose classification is delegated to utils/gestureUtils.js; this hook's
 * own job is stabilization — MediaPipe's landmark noise means a raw
 * per-frame guess flickers between poses, so a candidate gesture only
 * becomes "active" once utils/smoothing.js's mode smoother has seen it
 * consistently for several consecutive frames. Only one of these modes
 * is ever active at once, by construction — `classifyGesture` returns a
 * single value, so there's no separate flag to fall out of sync.
 *
 * Also separately tracks a pinch (thumb + index touching) as an instant
 * alternative to dwell-time selection in Cursor Mode — see
 * <ColorPalette />, which selects immediately on a pinch instead of
 * waiting out the hover timer.
 *
 * @param {Array<{x:number,y:number,z:number}>|null} landmarks
 * @returns {{ activeGesture: string|null, isPinching: boolean }}
 */
export default function useGestures(landmarks) {
  const [activeGesture, setActiveGesture] = useState(null)
  const [isPinching, setIsPinching] = useState(false)

  const smootherRef = useRef(null)
  if (!smootherRef.current) {
    smootherRef.current = createModeSmoother({ requiredFrames: 5, graceFrames: 4 })
  }
  const pinchFrameCountRef = useRef(0)

  useEffect(() => {
    const raw = classifyGesture(landmarks)
    const stable = smootherRef.current.update(raw)
    setActiveGesture((prev) => (prev === stable ? prev : stable))

    if (isPinchingPose(landmarks)) {
      pinchFrameCountRef.current = Math.min(
        pinchFrameCountRef.current + 1,
        PINCH_CONFIRM_FRAMES,
      )
    } else {
      pinchFrameCountRef.current = 0
    }
    const confirmedPinch = pinchFrameCountRef.current >= PINCH_CONFIRM_FRAMES
    setIsPinching((prev) => (prev === confirmedPinch ? prev : confirmedPinch))
  }, [landmarks])

  return { activeGesture, isPinching }
}
