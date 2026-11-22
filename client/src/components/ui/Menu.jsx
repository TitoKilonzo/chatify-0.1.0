import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cx } from '../../lib/cx.js';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';
import styles from './Menu.module.css';

/**
 * Dropdown action menu following the WAI-ARIA menu button pattern.
 *
 * trigger is a render function that receives the props to spread onto the trigger element:
 *   <Menu label="Account" items={[...]} trigger={(props) => <button {...props}>Open</button>} />
 * items: [{ id, label, icon?, onSelect }]
 * placement: bottom-start | bottom-end | top-start | top-end
 *
 * Keys: ArrowDown/ArrowUp open and move, Home/End jump, Escape closes and restores focus.
 */
export function Menu({ label, items, trigger, placement = 'bottom-start' }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  const pendingFocusRef = useRef(0);
  const menuId = useId();

  const closeWithoutFocus = useCallback(() => setOpen(false), []);
  useOutsideClick(wrapperRef, closeWithoutFocus, open);

  useEffect(() => {
    if (open) {
      itemRefs.current[pendingFocusRef.current]?.focus();
    }
  }, [open]);

  function openAt(index) {
    pendingFocusRef.current = index;
    if (open) {
      itemRefs.current[index]?.focus();
    } else {
      setOpen(true);
    }
  }

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const triggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => {
      if (open) {
        setOpen(false);
      } else {
        openAt(0);
      }
    },
    onKeyDown: (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openAt(0);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        openAt(items.length - 1);
      }
    },
  };

  function handleMenuKeyDown(event) {
    const current = itemRefs.current.indexOf(document.activeElement);
    const last = items.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        itemRefs.current[current >= last ? 0 : current + 1]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        itemRefs.current[current <= 0 ? last : current - 1]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        itemRefs.current[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        itemRefs.current[last]?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        closeAndRestoreFocus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      {trigger(triggerProps)}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          className={cx(styles.menu, styles[placement])}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={styles.item}
                onClick={() => {
                  closeAndRestoreFocus();
                  item.onSelect();
                }}
              >
                {Icon ? <Icon size={16} aria-hidden="true" /> : null}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
