/*
 * Which conversation the user is looking at right now. Realtime handlers consult this to decide
 * whether an incoming message counts as unread, and the conversation pane keeps it current.
 */
let viewingId = null;

export function setViewing(conversationId) {
  viewingId = conversationId;
}

export function getViewing() {
  return viewingId;
}

/** True when the conversation is open in a visible, focused window. */
export function isViewing(conversationId) {
  return (
    viewingId === conversationId &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    document.hasFocus()
  );
}
