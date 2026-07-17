import useCamera from '../hooks/useCamera'
import '../styles/webcam.css'

/**
 * WebcamView
 *
 * Renders the live, mirrored webcam feed full-screen using useCamera.
 * While the camera is starting (or if permission is denied), a friendly
 * placeholder takes its place so the screen never shows a blank video.
 *
 * @param {{ videoRef: import('react').RefObject<HTMLVideoElement> }} props
 *   videoRef is created by the parent (<App />) and shared with
 *   <DrawingOverlay /> so both components read from the same video
 *   element.
 */
export default function WebcamView({ videoRef }) {
  const { status, error, startCamera } = useCamera(videoRef)

  return (
    <div className="webcam-full">
      <video
        ref={videoRef}
        className="webcam-full__video"
        autoPlay
        playsInline
        muted
      />

      {status !== 'ready' && (
        <div className="webcam-full__placeholder">
          <span className="webcam-full__icon" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2l5 4V4l-5 4Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          {status === 'error' ? (
            <>
              <p className="webcam-full__title">Camera access needed</p>
              <p className="webcam-full__subtitle">
                {error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
                  ? 'Allow camera permission in your browser to start drawing in the air.'
                  : 'Something went wrong starting the camera. Check that no other app is using it.'}
              </p>
              <button
                type="button"
                className="webcam-full__retry"
                onClick={startCamera}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <p className="webcam-full__title">
                {status === 'loading' ? 'Waking up the camera…' : 'Camera feed not connected'}
              </p>
              <p className="webcam-full__subtitle">
                Hold on while we ask for permission to see you.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
