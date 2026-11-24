import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatDuration } from '../../lib/format.js';
import styles from './VoicePlayer.module.css';

/** Play button, seek bar and time for a voice note. The audio loads only when first played. */
export function VoicePlayer({ attachment }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [failed, setFailed] = useState(false);
  const total = attachment.durationMs ?? 0;

  useEffect(() => () => audioRef.current?.pause(), []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (playing) {
      audio.pause();
      return;
    }
    try {
      setFailed(false);
      await audio.play();
    } catch {
      setFailed(true);
    }
  }

  function seek(event) {
    const audio = audioRef.current;
    const next = Number(event.target.value);
    setPosition(next);
    if (audio) {
      audio.currentTime = next / 1000;
    }
  }

  return (
    <div className={styles.player}>
      {/* The controls are custom; captions do not apply to a recorded voice message. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={attachment.url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime * 1000)}
        onError={() => {
          setPlaying(false);
          setFailed(true);
        }}
      />
      <button
        type="button"
        className={styles.button}
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>
      <input
        type="range"
        className={styles.seek}
        min={0}
        max={Math.max(total, position, 1)}
        step={100}
        value={Math.min(position, Math.max(total, position))}
        onChange={seek}
        aria-label="Seek voice note"
      />
      <span className={styles.time}>
        {failed ? 'Cannot play' : formatDuration(playing || position > 0 ? position : total)}
      </span>
    </div>
  );
}
