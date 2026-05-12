"use client";

import * as React from "react";

/**
 * Returns event handlers for long-press detection and a consumeLongPress()
 * function that should be called at the top of onClick handlers.
 *
 * When a long-press fires, the browser still synthesises a click event
 * after the finger lifts. consumeLongPress() returns true (and resets the
 * flag) on that one synthetic click so callers can bail out early:
 *
 *   onClick={() => { if (consumeLongPress()) return; normalTap(); }}
 */
export function useLongPress(callback: () => void, delay = 500) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = React.useRef(false);

  const start = React.useCallback(() => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      callback();
    }, delay);
  }, [callback, delay]);

  const cancel = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const consumeLongPress = React.useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    handlers: {
      onMouseDown: start,
      onMouseUp: cancel,
      onMouseLeave: cancel,
      onTouchStart: start,
      onTouchEnd: cancel,
      onTouchCancel: cancel,
    },
    consumeLongPress,
  };
}
