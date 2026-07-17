import { GESTURE_INSTRUCTIONS } from '../constants/gestures'
import '../styles/instructions.css'

/**
 * Instructions
 *
 * Plain text lines floating over the top-right of the camera feed — no
 * background box, no border. Purely informational — no gesture
 * recognition runs here yet.
 */
export default function Instructions() {
  return (
    <ul className="instructions">
      {GESTURE_INSTRUCTIONS.map((item) => (
        <li className="instructions__row" key={item.id}>
          <span className="instructions__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="instructions__gesture">{item.label}</span>
          <span className="instructions__arrow">→</span>
          <span className="instructions__action">{item.action}</span>
        </li>
      ))}
    </ul>
  )
}
