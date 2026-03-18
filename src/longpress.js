export const LONG_PRESS_DELAY_MS = 500;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

export function movedBeyondLongPressTolerance(startPoint, nextPoint, tolerance = LONG_PRESS_MOVE_TOLERANCE_PX) {
  return (
    Math.abs(nextPoint.x - startPoint.x) > tolerance ||
    Math.abs(nextPoint.y - startPoint.y) > tolerance
  );
}
