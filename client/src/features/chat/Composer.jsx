import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { ApiError, api } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';
import { getSocket } from '../../lib/socket.js';
import { useDraftStore } from '../../stores/liveStores.js';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { sendMessage } from './messageActions.js';
import styles from './Composer.module.css';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_BODY = 4000;
const COUNTER_FROM = 3500;
const MAX_TEXTAREA_PX = 160;
const TYPING_REPEAT_MS = 2000;

/**
 * Message composer: autosizing textarea, file attachment with upload progress, drag-and-drop and
 * paste support (through the imperative addFile), per-conversation drafts, and typing signals.
 * Enter sends, Shift+Enter inserts a new line.
 */
export function Composer({ conversationId, meId, onSent, ref }) {
  const text = useDraftStore((state) => state.drafts[conversationId] ?? '');
  const setDraft = useDraftStore((state) => state.setDraft);
  const [upload, setUpload] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastTyping = useRef(0);
  const controllerRef = useRef(null);

  // An upload belongs to one conversation: switching chats drops it (the server cleans up).
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      setUpload(null);
    },
    [conversationId],
  );

  useEffect(() => {
    const element = textareaRef.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_PX)}px`;
    }
  }, [text]);

  function signalTyping(typing) {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('typing', { conversationId, typing });
    }
  }

  async function addFile(file) {
    if (!file) {
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUpload({
        file,
        status: 'error',
        progress: 0,
        error: `Files can be at most ${formatBytes(MAX_UPLOAD_BYTES)}`,
      });
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setUpload({ file, status: 'uploading', progress: 0 });
    try {
      const data = await api.upload('/attachments', file, {
        signal: controller.signal,
        onProgress: (progress) =>
          setUpload((current) => (current?.file === file ? { ...current, progress } : current)),
      });
      setUpload((current) =>
        current?.file === file
          ? { file, status: 'ready', progress: 1, attachment: data.attachment }
          : current,
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ABORTED') {
        return;
      }
      setUpload((current) =>
        current?.file === file
          ? { file, status: 'error', progress: 0, error: error.message }
          : current,
      );
    }
  }

  useImperativeHandle(ref, () => ({
    addFile,
    focus: () => textareaRef.current?.focus(),
  }));

  function removeUpload() {
    controllerRef.current?.abort();
    setUpload(null);
  }

  const uploading = upload?.status === 'uploading';
  const body = text.trim();
  const canSend = !uploading && (body.length > 0 || upload?.status === 'ready');

  function submit() {
    if (!canSend) {
      return;
    }
    sendMessage({
      conversationId,
      senderId: meId,
      body,
      attachment: upload?.status === 'ready' ? upload.attachment : null,
    });
    setDraft(conversationId, '');
    setUpload(null);
    signalTyping(false);
    lastTyping.current = 0;
    textareaRef.current?.focus();
    onSent?.();
  }

  function onChange(event) {
    const value = event.target.value;
    setDraft(conversationId, value);
    if (!value.trim()) {
      signalTyping(false);
      lastTyping.current = 0;
    } else if (Date.now() - lastTyping.current > TYPING_REPEAT_MS) {
      lastTyping.current = Date.now();
      signalTyping(true);
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function onPaste(event) {
    const file = event.clipboardData?.files?.[0];
    if (file) {
      event.preventDefault();
      addFile(file);
    }
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {upload ? (
        <div className={styles.upload}>
          <div className={styles.uploadInfo}>
            <span className={styles.uploadName}>{upload.file.name}</span>
            <span className={styles.uploadMeta}>
              {upload.status === 'error'
                ? upload.error
                : upload.status === 'uploading'
                  ? `Uploading ${Math.round(upload.progress * 100)}%`
                  : `${formatBytes(upload.file.size)} - ready to send`}
            </span>
            {uploading ? (
              <progress
                className={styles.progress}
                value={upload.progress}
                max={1}
                aria-label={`Uploading ${upload.file.name}`}
              />
            ) : null}
          </div>
          <IconButton label="Remove attachment" icon={X} size="sm" onClick={removeUpload} />
        </div>
      ) : null}

      <div className={styles.row}>
        <input
          ref={fileInputRef}
          type="file"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            addFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <IconButton
          label="Attach a file"
          icon={Paperclip}
          onClick={() => fileInputRef.current?.click()}
        />
        <label htmlFor={`composer-${conversationId}`} className="visually-hidden">
          Message
        </label>
        <textarea
          id={`composer-${conversationId}`}
          ref={textareaRef}
          className={styles.field}
          rows={1}
          maxLength={MAX_BODY}
          placeholder="Write a message"
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => signalTyping(false)}
        />
        <IconButton
          label="Send message"
          icon={Send}
          variant="primary"
          type="submit"
          disabled={!canSend}
        />
      </div>
      {text.length >= COUNTER_FROM ? (
        <p className={styles.counter} aria-live="polite">
          {text.length} / {MAX_BODY}
        </p>
      ) : null}
    </form>
  );
}
