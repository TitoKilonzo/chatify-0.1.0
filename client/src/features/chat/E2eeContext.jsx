import { createContext, useContext, useEffect, useState } from 'react';
import { openConversation, recallPlain } from '../../lib/e2eeSession.js';

/** What the open conversation offers for reading and writing encrypted messages. */
const E2eeContext = createContext({ active: false, ready: false, reason: null, decrypt: null });

export const useE2ee = () => useContext(E2eeContext);

/**
 * Provides the conversation's crypto to everything below it. active is the conversation's own
 * setting; ready means this device can encrypt and decrypt for it right now.
 */
export function E2eeProvider({ conversation, meId, children }) {
  const peerId = conversation.counterpart?.id;
  const wanted = conversation.type === 'direct' && Boolean(peerId);
  const [state, setState] = useState({ ready: false, reason: 'loading', api: null });

  useEffect(() => {
    if (!wanted) {
      return undefined;
    }
    let cancelled = false;
    openConversation(meId, peerId, conversation.id)
      .then((result) => {
        if (!cancelled) {
          setState(
            result.ok
              ? { ready: true, reason: null, api: result }
              : { ready: false, reason: result.reason, api: null },
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ ready: false, reason: 'error', api: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, meId, peerId, conversation.id, conversation.encrypted]);

  const value = {
    active: Boolean(conversation.encrypted),
    ready: state.ready,
    reason: state.reason,
    keys: state.api ? { mine: state.api.mine, theirs: state.api.theirs } : null,
    encrypt: state.api?.encrypt ?? null,
    decrypt: state.api?.decrypt ?? null,
  };
  return <E2eeContext.Provider value={value}>{children}</E2eeContext.Provider>;
}

/**
 * The readable text of a message: plain messages as they are, encrypted ones decrypted in memory.
 * Returns { text, state } where state is 'plain', 'ok', 'pending' or 'failed'.
 */
export function useMessageText(message) {
  const { decrypt, reason } = useE2ee();
  const [result, setResult] = useState({ key: null, text: null, failed: false });
  const encrypted = Boolean(message.encrypted) && !message.deletedAt;
  const key = `${message.id}:${message.body}`;

  useEffect(() => {
    if (!encrypted || !message.body || recallPlain(message.clientId) !== undefined || !decrypt) {
      return undefined;
    }
    let cancelled = false;
    decrypt(message.body)
      .then((text) => !cancelled && setResult({ key, text, failed: false }))
      .catch(() => !cancelled && setResult({ key, text: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [encrypted, message.body, message.clientId, decrypt, key]);

  if (!encrypted) {
    return { text: message.body, state: 'plain' };
  }
  const own = recallPlain(message.clientId);
  if (own !== undefined) {
    return { text: own, state: 'ok' };
  }
  if (result.key === key) {
    return result.failed ? { text: '', state: 'failed' } : { text: result.text, state: 'ok' };
  }
  if (!decrypt && reason && reason !== 'loading') {
    return { text: '', state: 'failed' };
  }
  return { text: '', state: 'pending' };
}
