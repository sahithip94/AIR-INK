/**
 * constants/gestures.js
 *
 * Central source of truth for gesture definitions.
 * Currently used only to render the Instructions panel.
 * Future gesture-recognition hooks (useGestures, useHandTracking) should
 * import GESTURE_TYPES from here instead of redefining string literals,
 * so recognition logic and UI copy never drift apart.
 */

export const GESTURE_TYPES = {
  DRAW: 'DRAW',
  CURSOR: 'CURSOR',
  SELECT_COLOR: 'SELECT_COLOR',
  CLEAR_CANVAS: 'CLEAR_CANVAS',
  ERASER: 'ERASER',
}

export const GESTURE_INSTRUCTIONS = [
  {
    id: GESTURE_TYPES.DRAW,
    icon: '☝️',
    label: 'One Finger',
    action: 'Draw',
  },
  {
    id: GESTURE_TYPES.CURSOR,
    icon: '✌️',
    label: 'Two Fingers',
    action: 'Cursor Mode',
  },
  {
    id: GESTURE_TYPES.SELECT_COLOR,
    icon: '🎨',
    label: 'Hover 1 sec',
    action: 'Select Color',
  },
  {
    id: GESTURE_TYPES.CLEAR_CANVAS,
    icon: '👍',
    label: 'Thumb Up',
    action: 'Clear Canvas',
  },
  {
    id: GESTURE_TYPES.ERASER,
    icon: '✊',
    label: 'Fist',
    action: 'Eraser',
  },
]
