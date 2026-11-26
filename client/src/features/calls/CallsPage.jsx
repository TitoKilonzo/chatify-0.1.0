import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Phone, RotateCw, Video } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { api } from '../../lib/api.js';
import { formatDayLabel, formatMessageTime } from '../../lib/date.js';
import { startCall, useCall } from '../../lib/calls.js';
import styles from './CallsPage.module.css';

function outcomeLabel(call) {
  if (call.outcome === 'missed') {
    return call.direction === 'incoming' ? 'Missed call' : 'No answer';
  }
  if (call.outcome === 'declined') {
    return call.direction === 'incoming' ? 'Declined by you' : 'Declined';
  }
  if (call.outcome === 'cancelled') {
    return call.direction === 'incoming' ? 'Cancelled by caller' : 'Cancelled';
  }
  if (call.outcome === 'dropped') {
    return 'Disconnected';
  }
  if (call.outcome === 'timeout') {
    return 'Call limit reached';
  }
  if (call.outcome === 'interrupted') {
    return 'Call interrupted';
  }
  return 'Completed';
}

function durationLabel(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function CallsPage() {
  const [callError, setCallError] = useState(null);
  const busy = useCall((state) => state.phase !== 'idle');
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['call-history'],
    queryFn: async () => (await api.get('/calls/history')).calls,
    refetchOnMount: 'always',
  });

  async function callBack(item) {
    setCallError(null);
    try {
      await startCall(item.conversationId, item.video);
    } catch (err) {
      setCallError(err.message);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Calls</h1>
        <p className={styles.subtitle}>Your recent voice and video calls</p>
      </header>

      {callError ? <Alert>{callError}</Alert> : null}
      {isError ? <Alert>{error.message}</Alert> : null}
      {isPending ? <p className={styles.muted}>Loading call history...</p> : null}
      {!isPending && !isError && data?.length === 0 ? (
        <p className={styles.empty}>Calls you make and receive will appear here.</p>
      ) : null}

      <ul className={styles.list}>
        {data?.map((item) => {
          const incoming = item.direction === 'incoming';
          const missed = item.outcome === 'missed';
          const DirectionIcon = incoming ? ArrowDownLeft : ArrowUpRight;
          const TypeIcon = item.video ? Video : Phone;
          const peerName = item.peer?.displayName ?? 'Chatify user';
          return (
            <li key={item.id} className={styles.row}>
              <span
                className={`${styles.direction} ${missed ? styles.missed : ''}`}
                aria-hidden="true"
              >
                <DirectionIcon size={18} />
              </span>
              <Link className={styles.details} to={`/chats/${item.conversationId}`}>
                <span className={styles.peer}>{peerName}</span>
                <span className={`${styles.outcome} ${missed ? styles.missedText : ''}`}>
                  <TypeIcon size={14} aria-hidden="true" />
                  {outcomeLabel(item)}
                  {item.durationSeconds > 0 ? ` | ${durationLabel(item.durationSeconds)}` : ''}
                </span>
                <span className={styles.muted}>
                  {formatDayLabel(item.startedAt)} | {formatMessageTime(item.startedAt)}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={RotateCw}
                disabled={busy || !item.peer}
                onClick={() => callBack(item)}
                aria-label={`Call ${peerName} back`}
              >
                Call
              </Button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
