import { useEffect, useRef, useState } from 'react'
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands'

/**
 * hooks/useHandTracking.js
 *
 * Initializes MediaPipe Hands against the <video> element referenced by
 * `videoRef`, feeds it a frame on every animation tick, and keeps only
 * the single most confidently detected hand. `maxNumHands` is set to 1
 * since the app only ever uses one hand — tracking a second candidate
 * purely to discard it would cost real per-frame compute for nothing.
 * The best-of-N selection logic below is left in place (it's a no-op
 * with a single candidate) so raising maxNumHands back up later — e.g.
 * for a future two-hand gesture — wouldn't need any other changes here.
 *
 * @param {import('react').RefObject<HTMLVideoElement>} videoRef
 *   The same video element ref used by <WebcamView /> / useCamera.
 */
export default function useHandTracking(videoRef) {
  const [landmarks, setLandmarks] = useState(null)
  const [handedness, setHandedness] = useState(null)
  const [isTracking, setIsTracking] = useState(false)
  const [isModelLoaded, setIsModelLoaded] = useState(false)

  const rafIdRef = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    const videoEl = videoRef?.current
    if (!videoEl) return undefined

    cancelledRef.current = false

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    })

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      // Detection confidence (fresh, cold-start recognition of a hand)
      // stays strict — this is what "accuracy" mostly hinges on. Tracking
      // confidence (continuing to follow a hand MediaPipe already found
      // last frame) is relaxed: it was dropping tracking prematurely
      // whenever the hand neared the edges of frame or moved quickly,
      // forcing a fresh cold-start detection — which is slower and
      // itself less reliable right at the edges — instead of just
      // continuing the track it already had.
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    })

    hands.onResults((results) => {
      if (cancelledRef.current) return

      const allLandmarks = results.multiHandLandmarks
      const allHandedness = results.multiHandedness

      if (!allLandmarks || allLandmarks.length === 0) {
        setLandmarks(null)
        setHandedness(null)
        setIsTracking(false)
        return
      }

      // Keep only the most confidently detected hand.
      let bestIndex = 0
      let bestScore = allHandedness?.[0]?.score ?? 0
      for (let i = 1; i < allLandmarks.length; i += 1) {
        const score = allHandedness?.[i]?.score ?? 0
        if (score > bestScore) {
          bestScore = score
          bestIndex = i
        }
      }

      setLandmarks(allLandmarks[bestIndex])
      setHandedness(allHandedness?.[bestIndex] ?? null)
      setIsTracking(true)
    })

    setIsModelLoaded(true)

    const processFrame = async () => {
      if (cancelledRef.current) return

      if (videoEl.readyState >= 2) {
        try {
          await hands.send({ image: videoEl })
        } catch {
          // A frame can occasionally fail to process while the model is
          // still warming up — safe to skip and try again next tick.
        }
      }

      rafIdRef.current = requestAnimationFrame(processFrame)
    }

    processFrame()

    return () => {
      cancelledRef.current = true
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      hands.close()
      setIsModelLoaded(false)
      setIsTracking(false)
      setLandmarks(null)
      setHandedness(null)
    }
  }, [videoRef])

  return {
    landmarks, // 21 normalized { x, y, z } points for the best hand, or null
    connections: HAND_CONNECTIONS, // static [start, end] index pairs for the skeleton
    handedness, // { index, score, label } for the kept hand, or null
    isTracking,
    isModelLoaded,
  }
}
