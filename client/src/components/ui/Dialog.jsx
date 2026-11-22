import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { IconButton } from './IconButton.jsx';
import styles from './Dialog.module.css';

/**
 * Modal dialog built on the native <dialog> element, which supplies the focus trap, inert
 * background, and Escape handling. Content is mounted only while open so forms reset on close.
 * Clicking the backdrop closes the dialog.
 */
export function Dialog({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  function handleClose() {
    // The native close event also fires when we close programmatically; only report user closes.
    if (open) {
      onClose();
    }
  }

  function handleBackdropClick(event) {
    if (event.target === ref.current) {
      onClose();
    }
  }

  return (
    // The click handler only implements backdrop dismissal; keyboard users close with Escape or
    // the labelled close button, both of which the native dialog and IconButton already provide.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <dialog
      ref={ref}
      className={cx(styles.dialog, styles[size])}
      aria-labelledby={titleId}
      onClose={handleClose}
      onClick={handleBackdropClick}
    >
      {open ? (
        <div className={styles.panel}>
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <IconButton label="Close dialog" icon={X} size="sm" onClick={onClose} />
          </header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
