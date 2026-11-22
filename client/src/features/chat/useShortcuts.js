import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Keyboard shortcuts shown on the Settings page; keep the two lists in sync. */
export const SHORTCUTS = [
  { keys: 'Ctrl+K (Cmd+K on Mac)', action: 'Search conversations' },
  { keys: 'Alt+Up / Alt+Down', action: 'Open the previous or next conversation' },
  { keys: 'Enter', action: 'Send the message' },
  { keys: 'Shift+Enter', action: 'New line in the message' },
  { keys: 'Escape', action: 'Close a dialog or the image viewer' },
];

/**
 * Global chat shortcuts. conversations is the visible, ordered list so Alt+Arrow follows what the
 * user sees on screen.
 */
export function useShortcuts({ section, activeId, conversations, searchRef }) {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (conversations.length === 0) {
          return;
        }
        event.preventDefault();
        const index = conversations.findIndex((item) => item.id === activeId);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next =
          index === -1 ? 0 : (index + step + conversations.length) % conversations.length;
        navigate(`/${section}/${conversations[next].id}`);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [section, activeId, conversations, searchRef, navigate]);
}
