import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_VOICE_MS = 5 * 60 * 1000;
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export function voiceSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function extensionFor(mime) {
  if (mime.includes('ogg')) {
    return 'ogg';
  }
  if (mime.includes('mp4')) {
    return 'm4a';
  }
  return 'webm';
}

/**
 * Record a voice note with MediaRecorder. start() asks for the microphone; finish() resolves with
 * { file, durationMs } for sending; cancel() throws the recording away. The microphone is always
 * released when recording ends, is cancelled, or the component unmounts.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState('idle'); // idle | recording
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAt = useRef(0);
  const timer = useRef(null);
  const resolveRef = useRef(null);

  const release = useCallback(() => {
    clearInterval(timer.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setState('idle');
    setElapsedMs(0);
  }, []);

  useEffect(
    () => () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        resolveRef.current = null;
        recorderRef.current.stop();
      }
      release();
    },
    [release],
  );

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const durationMs = Math.min(Date.now() - startedAt.current, MAX_VOICE_MS);
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const resolve = resolveRef.current;
        resolveRef.current = null;
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        release();
        if (resolve && blob.size > 0) {
          const file = new File([blob], `voice-note.${extensionFor(type)}`, { type });
          resolve({ file, durationMs });
        } else if (resolve) {
          resolve(null);
        }
      };
      recorderRef.current = recorder;
      startedAt.current = Date.now();
      recorder.start();
      setState('recording');
      timer.current = setInterval(() => {
        const elapsed = Date.now() - startedAt.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_VOICE_MS && recorderRef.current?.state === 'recording') {
          recorderRef.current.stop();
        }
      }, 250);
    } catch (err) {
      release();
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone access is blocked. Allow it in your browser settings to record.'
          : 'Could not start recording on this device.',
      );
    }
  }, [release]);

  /** Stop and return the recording, or null when nothing usable was captured. */
  const finish = useCallback(
    () =>
      new Promise((resolve) => {
        if (!recorderRef.current || recorderRef.current.state === 'inactive') {
          resolve(null);
          return;
        }
        resolveRef.current = resolve;
        recorderRef.current.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    resolveRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      release();
    }
  }, [release]);

  return { state, elapsedMs, error, start, finish, cancel };
}
