import { cloneElement, useEffect, useId, useState } from 'react';
import { cx } from '../../lib/cx.js';
import styles from './Tooltip.module.css';

/**
 * Hover and focus tooltip around a single focusable child. The tooltip is supplementary: the child
 * must already have its own accessible name (for example an IconButton label). Escape dismisses it.
 * side: top | bottom | right
 */
export function Tooltip({ content, side = 'top', children }) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setVisible(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  return (
    <span
      className={styles.wrapper}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {cloneElement(children, visible ? { 'aria-describedby': id } : {})}
      {visible ? (
        <span role="tooltip" id={id} className={cx(styles.tooltip, styles[side])}>
          {content}
        </span>
      ) : null}
    </span>
  );
}
