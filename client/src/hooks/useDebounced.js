import { useEffect, useState } from 'react';

/** The value, delayed until it has stopped changing for delayMs. */
export function useDebounced(value, delayMs = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
