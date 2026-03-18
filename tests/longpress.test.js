import test from "node:test";
import assert from "node:assert/strict";

import { LONG_PRESS_MOVE_TOLERANCE_PX, movedBeyondLongPressTolerance } from "../src/longpress.js";

test("long press ignores tiny finger drift but cancels once movement exceeds tolerance", () => {
  const startPoint = { x: 120, y: 240 };

  assert.equal(
    movedBeyondLongPressTolerance(startPoint, {
      x: startPoint.x + LONG_PRESS_MOVE_TOLERANCE_PX - 1,
      y: startPoint.y,
    }),
    false,
  );
  assert.equal(
    movedBeyondLongPressTolerance(startPoint, {
      x: startPoint.x + LONG_PRESS_MOVE_TOLERANCE_PX + 1,
      y: startPoint.y,
    }),
    true,
  );
  assert.equal(
    movedBeyondLongPressTolerance(startPoint, {
      x: startPoint.x,
      y: startPoint.y + LONG_PRESS_MOVE_TOLERANCE_PX + 1,
    }),
    true,
  );
});
