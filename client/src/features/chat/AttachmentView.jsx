import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { formatBytes } from '../../lib/format.js';
import { VoicePlayer } from './VoicePlayer.jsx';
import styles from './AttachmentView.module.css';

/** An attachment inside a message bubble: a thumbnail that opens a viewer, or a download card. */
export function AttachmentView({ attachment }) {
  const [viewing, setViewing] = useState(false);

  if (attachment.kind === 'voice') {
    return <VoicePlayer attachment={attachment} />;
  }

  if (attachment.kind === 'image') {
    const ratio =
      attachment.width && attachment.height ? attachment.width / attachment.height : undefined;
    return (
      <>
        <button
          type="button"
          className={styles.imageButton}
          onClick={() => setViewing(true)}
          aria-label={`Open image ${attachment.name}`}
        >
          <img
            src={attachment.thumbnailUrl ?? attachment.url}
            alt={attachment.name}
            className={styles.image}
            style={ratio ? { aspectRatio: ratio } : undefined}
            loading="lazy"
          />
        </button>
        <Dialog open={viewing} onClose={() => setViewing(false)} title={attachment.name} size="lg">
          <div className={styles.viewer}>
            <img src={attachment.url} alt={attachment.name} className={styles.full} />
            <a className={styles.download} href={attachment.url} download={attachment.name}>
              <Download size={16} aria-hidden="true" />
              <span>Download ({formatBytes(attachment.sizeBytes)})</span>
            </a>
          </div>
        </Dialog>
      </>
    );
  }

  return (
    <a className={styles.file} href={attachment.url} download={attachment.name}>
      <FileText size={24} aria-hidden="true" />
      <span className={styles.fileText}>
        <span className={styles.fileName}>{attachment.name}</span>
        <span className={styles.fileSize}>{formatBytes(attachment.sizeBytes)}</span>
      </span>
      <Download size={16} aria-hidden="true" />
      <span className="visually-hidden">Download</span>
    </a>
  );
}
