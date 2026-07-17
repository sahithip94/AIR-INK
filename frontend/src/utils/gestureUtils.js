/**
 * utils/gestureUtils.js
 *
 * Pure helper functions for interpreting a single frame of MediaPipe hand
 * landmarks into finger/pose states. No React, no timing/stabilization
 * logic (that lives in useGestures.js + utils/smoothing.js) — just "given
 * this one set of 21 points, what does the hand look like right now".
 */

const WRIST = 0
const THUMB_TIP = 4
const THUMB_MCP = 2
const INDEX_TIP = 8
const INDEX_PIP = 6
const INDEX_MCP = 5
const MIDDLE_TIP = 12
const MIDDLE_PIP = 10
const MIDDLE_MCP = 9
const RING_TIP = 16
const RING_PIP = 14
const RING_MCP = 13
const PINKY_TIP = 20
const PINKY_PIP = 18
const PINKY_MCP = 17

function distance(a, b) {
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0))
}

/**
 * A finger is considered extended when its tip sits farther from the
 * wrist than its own pip and mcp joints do. Comparing distances (rather
 * than just tip.y < pip.y) keeps this working even when the hand is
 * tilted or rotated in frame, not just held perfectly upright.
 */
export function isFingerExtended(landmarks, tipIdx, pipIdx, mcpIdx) {
  if (!landmarks) return false
  const wrist = landmarks[WRIST]
  const tip = landmarks[tipIdx]
  const pip = landmarks[pipIdx]
  const mcp = landmarks[mcpIdx]
  if (!wrist || !tip || !pip || !mcp) return false

  const tipDist = distance(tip, wrist)
  const pipDist = distance(pip, wrist)
  const mcpDist = distance(mcp, wrist)

  return tipDist > pipDist && pipDist > mcpDist * 0.9
}

export function isIndexRaised(landmarks) {
  return isFingerExtended(landmarks, INDEX_TIP, INDEX_PIP, INDEX_MCP)
}

export function isMiddleRaised(landmarks) {
  return isFingerExtended(landmarks, MIDDLE_TIP, MIDDLE_PIP, MIDDLE_MCP)
}

export function isRingRaised(landmarks) {
  return isFingerExtended(landmarks, RING_TIP, RING_PIP, RING_MCP)
}

export function isPinkyRaised(landmarks) {
  return isFingerExtended(landmarks, PINKY_TIP, PINKY_PIP, PINKY_MCP)
}

/**
 * The thumb extends sideways rather than "up" in image space, so instead
 * of comparing it to the wrist, this checks how far the tip sits from the
 * index knuckle relative to the thumb's own base joint.
 */
export function isThumbRaised(landmarks) {
  if (!landmarks) return false
  const tip = landmarks[THUMB_TIP]
  const mcp = landmarks[THUMB_MCP]
  const indexMcp = landmarks[INDEX_MCP]
  if (!tip || !mcp || !indexMcp) return false

  return distance(tip, indexMcp) > distance(mcp, indexMcp) * 1.3
}

/**
 * The classic 👍 shape: thumb extended and pointing upward on screen,
 * while the other four fingers stay curled.
 *
 * This used to compare the thumb tip's height only against the wrist —
 * but the wrist sits below virtually every raised-hand pose, fist
 * included, so that check passed far more often than an actual thumbs-up.
 * In particular, a natural closed fist often rests the thumb up and over
 * the curled fingers, which was enough to satisfy the old check and get
 * misread as CLEAR_CANVAS instead of ERASER. Fixed by requiring the
 * thumb to be genuinely extended away from the palm (not just resting on
 * top of it), and clearly above the *other fingertips* specifically —
 * not merely above the wrist, which is a much weaker condition.
 */
export function isThumbUp(landmarks) {
  if (!landmarks) return false
  const thumbTip = landmarks[THUMB_TIP]
  const middleTip = landmarks[MIDDLE_TIP]
  const ringTip = landmarks[RING_TIP]
  const pinkyTip = landmarks[PINKY_TIP]
  if (!thumbTip || !middleTip || !ringTip || !pinkyTip) return false

  const othersCurled =
    !isIndexRaised(landmarks) &&
    !isMiddleRaised(landmarks) &&
    !isRingRaised(landmarks) &&
    !isPinkyRaised(landmarks)
  if (!othersCurled) return false

  // A fist's thumb often rests near/over the curled fingers without being
  // truly extended — require real extension so a fist can't pass this.
  if (!isThumbRaised(landmarks)) return false

  // The thumb tip must sit above the curled fingertips themselves
  // (smaller y = higher on screen) — not merely above the wrist, which is
  // true of almost any upright hand pose. isThumbRaised() above already
  // does the heavy lifting of ruling out a fist (a fist's thumb isn't
  // truly extended), so this only needs a small margin as a sanity check,
  // not a strict one — a strict margin here just made real thumbs-up
  // gestures flicker in and out of detection before the gesture
  // stabilizer could ever confirm them.
  const highestCurledFingertipY = Math.min(middleTip.y, ringTip.y, pinkyTip.y)
  return thumbTip.y < highestCurledFingertipY - 0.02
}

/** All five fingers curled in — a closed fist. */
export function isFist(landmarks) {
  if (!landmarks) return false
  return (
    !isIndexRaised(landmarks) &&
    !isMiddleRaised(landmarks) &&
    !isRingRaised(landmarks) &&
    !isPinkyRaised(landmarks) &&
    !isThumbRaised(landmarks)
  )
}

export function countExtendedFingers(landmarks) {
  if (!landmarks) return 0
  return [
    isThumbRaised(landmarks),
    isIndexRaised(landmarks),
    isMiddleRaised(landmarks),
    isRingRaised(landmarks),
    isPinkyRaised(landmarks),
  ].filter(Boolean).length
}

/**
 * True when the thumb tip and index fingertip are touching (a pinch) —
 * used as an instant alternative to dwell-time selection in Cursor Mode.
 * The threshold is normalized against the hand's own scale (wrist to
 * index knuckle) rather than a fixed distance, so it works whether the
 * hand is close to the camera or far away.
 */
export function isPinching(landmarks) {
  if (!landmarks) return false
  const wrist = landmarks[WRIST]
  const thumbTip = landmarks[THUMB_TIP]
  const indexTip = landmarks[INDEX_TIP]
  const indexMcp = landmarks[INDEX_MCP]
  if (!wrist || !thumbTip || !indexTip || !indexMcp) return false

  const handScale = distance(wrist, indexMcp)
  if (!handScale) return false

  return distance(thumbTip, indexTip) < handScale * 0.45
}

/**
 * Classifies one raw frame of landmarks into a single gesture guess.
 * Intentionally simple and un-smoothed — useGestures.js is responsible
 * for debouncing this over multiple frames so the active mode doesn't
 * flicker. Returns a GESTURE_TYPES value, or null if the pose doesn't
 * match anything recognized (or there's no hand at all).
 */
export function classifyGesture(landmarks) {
  if (!landmarks) return null

  if (isThumbUp(landmarks)) return 'CLEAR_CANVAS'
  if (isFist(landmarks)) return 'ERASER'

  const index = isIndexRaised(landmarks)
  const middle = isMiddleRaised(landmarks)

  if (index && middle) return 'CURSOR'
  if (index && !middle) return 'DRAW'

  return null
}
