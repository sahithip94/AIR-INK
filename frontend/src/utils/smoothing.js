/**
 * utils/smoothing.js
 *
 * Pure, framework-agnostic smoothing helpers shared by useFingerTracking
 * (cursor jitter) and useGestures (mode flicker). Kept dependency-free so
 * they're easy to reason about and test in isolation from React/MediaPipe.
 */

/**
 * One Euro Filter for 2D points (Casiez, Roussel & Vogel, 2012) — the
 * standard smoothing technique for exactly this problem: a noisy,
 * high-frequency input signal (raw MediaPipe landmarks) that needs to
 * drive a low-latency on-screen cursor.
 *
 * Unlike a fixed-factor EMA, its cutoff frequency adapts to how fast the
 * point is currently moving: when the fingertip is nearly still, it
 * filters aggressively (kills jitter); when it's moving fast (a quick
 * stroke), it backs off and tracks more closely (kills lag). That's what
 * a constant smoothing factor structurally can't do — turn it down enough
 * to stop idle jitter and it also blurs fast motion; turn it up enough to
 * track fast motion and idle jitter comes back.
 *
 * @param {{minCutoff?: number, beta?: number, dCutoff?: number}} options
 *   minCutoff - baseline cutoff frequency (Hz). Lower = smoother at rest.
 *   beta - how much speed increases the cutoff. Higher = less lag when moving fast.
 *   dCutoff - cutoff used for smoothing the derivative (speed) estimate itself.
 */
export function createOneEuroFilter({ minCutoff = 1.0, beta = 0.015, dCutoff = 1.0 } = {}) {
  let xPrev = null
  let dxPrev = { x: 0, y: 0 }
  let tPrev = null

  const alpha = (cutoff, dt) => {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  const lowPass = (value, prevValue, a) =>
    prevValue === null ? value : a * value + (1 - a) * prevValue

  return {
    filter(point, timestamp = performance.now()) {
      if (!point) return null

      if (!xPrev || tPrev === null) {
        xPrev = { x: point.x, y: point.y }
        dxPrev = { x: 0, y: 0 }
        tPrev = timestamp
        return xPrev
      }

      // Clamp dt on both ends. The minimum stops a near-zero interval
      // (dropped frame, background tab) from blowing the filter up.
      // The maximum matters just as much: without it, resuming after a
      // cursor freeze (see useFingerTracking's grace period) feeds in a
      // large dt, which drives the cutoff/alpha calculation right up to
      // ~1 — i.e. "trust the new sample completely" — and the cursor
      // would snap straight to the reacquired position instead of easing
      // back in smoothly. Clamping the max dt makes the filter treat a
      // reacquire like any other frame and ramp back in over a few
      // frames the normal way.
      const dt = Math.min(Math.max((timestamp - tPrev) / 1000, 1 / 120), 1 / 20)
      tPrev = timestamp

      const dx = { x: (point.x - xPrev.x) / dt, y: (point.y - xPrev.y) / dt }
      const aD = alpha(dCutoff, dt)
      const dxHat = {
        x: lowPass(dx.x, dxPrev.x, aD),
        y: lowPass(dx.y, dxPrev.y, aD),
      }
      dxPrev = dxHat

      const speed = Math.hypot(dxHat.x, dxHat.y)
      const cutoff = minCutoff + beta * speed
      const a = alpha(cutoff, dt)

      const xHat = {
        x: lowPass(point.x, xPrev.x, a),
        y: lowPass(point.y, xPrev.y, a),
      }
      xPrev = xHat

      return xHat
    },
    reset() {
      xPrev = null
      dxPrev = { x: 0, y: 0 }
      tPrev = null
    },
  }
}

/**
 * True when `next` is farther from `prev` than `maxDistance` — a single
 * frame's worth of MediaPipe landmark noise very rarely teleports the
 * fingertip hundreds of pixels; when it does, it's almost always a
 * mis-detection (motion blur, a similar-looking object, momentary
 * occlusion) rather than real motion. Used to reject that one bad sample
 * outright instead of letting the smoother chase it.
 */
export function isJumpTooLarge(prev, next, maxDistance) {
  if (!prev || !next) return false
  return Math.hypot(next.x - prev.x, next.y - prev.y) > maxDistance
}

/**
 * Exponential moving average smoother for 2D points (e.g. a fingertip
 * position). Call `smooth(point)` with each new raw sample; it eases
 * toward the raw input rather than jumping straight to it, which is what
 * turns MediaPipe's frame-to-frame jitter into a steady cursor.
 *
 * Simpler and cheaper than the One Euro Filter above, but fixed-factor —
 * kept here as a lightweight option for anything that doesn't need
 * speed-adaptive smoothing.
 *
 * @param {number} smoothingFactor - 0–1. Lower = smoother but laggier,
 *   higher = snappier but jitterier.
 */
export function createPositionSmoother(smoothingFactor = 0.35) {
  let current = null

  return {
    smooth(point) {
      if (!point) return null
      if (!current) {
        current = { x: point.x, y: point.y }
        return current
      }
      current = {
        x: current.x + (point.x - current.x) * smoothingFactor,
        y: current.y + (point.y - current.y) * smoothingFactor,
      }
      return current
    },
    reset() {
      current = null
    },
  }
}

/**
 * Debounces a rapidly-changing discrete value (e.g. a raw per-frame
 * gesture guess) so it only "confirms" a new value once it has been seen
 * for `requiredFrames` consecutive samples in a row. Also tolerates up to
 * `graceFrames` samples of `null` (a momentary tracking dropout, like a
 * hand briefly leaving frame) without immediately resetting to null, so
 * the active mode doesn't flicker off during normal noisy detection.
 */
export function createModeSmoother({ requiredFrames = 5, graceFrames = 4 } = {}) {
  let confirmed = null
  let pendingValue = null
  let pendingCount = 0
  let missingCount = 0

  return {
    update(rawValue) {
      if (rawValue === null || rawValue === undefined) {
        missingCount += 1
        if (missingCount > graceFrames) {
          confirmed = null
          pendingValue = null
          pendingCount = 0
        }
        return confirmed
      }

      missingCount = 0

      if (rawValue === pendingValue) {
        pendingCount += 1
      } else {
        pendingValue = rawValue
        pendingCount = 1
      }

      if (pendingCount >= requiredFrames) {
        confirmed = rawValue
      }

      return confirmed
    },
    reset() {
      confirmed = null
      pendingValue = null
      pendingCount = 0
      missingCount = 0
    },
  }
}

/** Simple scalar exponential moving average, for anything that isn't a 2D point. */
export function movingAverage(previous, next, factor = 0.35) {
  if (previous === null || previous === undefined) return next
  return previous + (next - previous) * factor
}
