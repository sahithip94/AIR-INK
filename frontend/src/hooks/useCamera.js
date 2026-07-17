import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * hooks/useCamera.js
 *
 * Requests webcam permission, opens a MediaStream via
 * `navigator.mediaDevices.getUserMedia`, and attaches it to a <video>
 * element ref. Starts automatically on mount and cleans up (stops all
 * tracks) on unmount, while also exposing manual start/stop for retrying
 * after a permission error or pausing the feed.
 *
 * @param {import('react').RefObject<HTMLVideoElement>} [externalRef]
 *   Optional ref to share with a sibling component (e.g. so
 *   useHandTracking can read frames from the same <video> element that
 *   <WebcamView /> renders). If omitted, an internal ref is created.
 */
export default function useCamera(externalRef) {
  const internalRef = useRef(null)
  const videoRef = externalRef ?? internalRef
  const streamRef = useRef(null)

  const [stream, setStream] = useState(null)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStream(null)
    setStatus('idle')
  }, [videoRef])

  const startCamera = useCallback(async () => {
    setStatus('loading')
    setError(null)

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })

      streamRef.current = mediaStream

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        try {
          await videoRef.current.play()
        } catch {
          // Autoplay can be blocked until a user gesture; the <video>
          // element will still start once playback is allowed.
        }
      }

      setStream(mediaStream)
      setStatus('ready')
    } catch (err) {
      setError(err)
      setStatus('error')
    }
  }, [videoRef])

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { videoRef, stream, status, error, startCamera, stopCamera }
}
