import { useEffect } from 'react';

/**
 * Call handler when a pointer press lands outside the referenced element.
 * The handler must be referentially stable (wrap it in useCallback).
 */
export function useOutsideClick(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        handler();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [ref, handler, enabled]);
}
