import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import {
  acceptCall,
  dismissCallNotice,
  hangUp,
  toggleCamera,
  toggleMute,
  useCall,
} from '../../lib/calls.js';
import { conversationTitle } from '../../lib/conversation-cache.js';
import { useConversationsQuery } from './useConversations.js';
import styles from './CallOverlay.module.css';

function useStream(ref, stream) {
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [ref, stream]);
}

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      setSeconds(0);
    };
  }, [active]);
  return seconds;
}

/** Incoming ring, outgoing ring, and the in-call screen. Mounted once in the signed-in shell. */
export function CallOverlay() {
  const { phase, call, video, muted, cameraOff, localStream, remoteStream, notice } = useCall();
  const conversations = useConversationsQuery();
  const remoteRef = useRef(null);
  const localRef = useRef(null);
  useStream(remoteRef, remoteStream);
  useStream(localRef, localStream);
  const seconds = useElapsed(phase === 'active');

  // A notice such as "No answer" clears itself.
  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timer = setTimeout(dismissCallNotice, 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (phase === 'idle') {
    return notice ? (
      <p className={styles.notice} role="status">
        {notice}
      </p>
    ) : null;
  }

  const conversation = (conversations.data ?? []).find((item) => item.id === call?.conversationId);
  const name = conversation ? conversationTitle(conversation) : 'Call';
  const showVideo = video && (phase === 'connecting' || phase === 'active');
  const status = {
    'ringing-in': video ? 'Incoming video call' : 'Incoming voice call',
    'ringing-out': 'Calling...',
    connecting: 'Connecting...',
    active: formatElapsed(seconds),
  }[phase];

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="false"
      aria-label={`Call with ${name}`}
    >
      {/* A live call has no caption track to attach. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={remoteRef}
        className={showVideo ? styles.remote : styles.hidden}
        autoPlay
        playsInline
      />
      {showVideo ? (
        <video
          ref={localRef}
          className={styles.local}
          autoPlay
          playsInline
          muted
          aria-label="Your camera"
        />
      ) : null}

      <div className={styles.info}>
        <h2 className={styles.name}>{name}</h2>
        <p className={styles.status} role="status" aria-live="polite">
          {status}
        </p>
      </div>

      <div className={styles.controls}>
        {phase === 'ringing-in' ? (
          <>
            <Button variant="secondary" leadingIcon={PhoneOff} onClick={() => hangUp()}>
              Decline
            </Button>
            <Button variant="primary" leadingIcon={video ? Video : Phone} onClick={acceptCall}>
              Answer
            </Button>
          </>
        ) : (
          <>
            <IconButton
              label={muted ? 'Unmute microphone' : 'Mute microphone'}
              icon={muted ? MicOff : Mic}
              variant="inverse"
              onClick={toggleMute}
            />
            {video ? (
              <IconButton
                label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                icon={cameraOff ? VideoOff : Video}
                variant="inverse"
                onClick={toggleCamera}
              />
            ) : null}
            <Button variant="secondary" leadingIcon={PhoneOff} onClick={() => hangUp()}>
              {phase === 'ringing-out' ? 'Cancel' : 'End call'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
