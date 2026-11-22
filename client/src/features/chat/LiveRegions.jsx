import { WifiOff } from 'lucide-react';
import { useAnnouncerStore, useConnectionStore } from '../../stores/liveStores.js';
import styles from './LiveRegions.module.css';

/** Visually hidden live region that reads out new-message notices to screen reader users. */
export function Announcer() {
  const text = useAnnouncerStore((state) => state.text);
  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}

/** Banner shown while the realtime connection is down. Sending still works over HTTP. */
export function ConnectionBanner() {
  const status = useConnectionStore((state) => state.status);
  if (status === 'connected') {
    return null;
  }
  return (
    <div className={styles.banner} role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span>
        {status === 'connecting'
          ? 'Connecting...'
          : 'Reconnecting. Messages you send are kept and delivered when the connection returns.'}
      </span>
    </div>
  );
}
