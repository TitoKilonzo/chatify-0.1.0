import { CheckCheck, Paperclip, User } from 'lucide-react';
import styles from './AuthScene.module.css';

/**
 * Decorative 3D illustration of a conversation: floating message bubbles, an attachment and a
 * typing indicator on an isometric plate. It is built from CSS transforms only, carries no text
 * or sample data, is hidden from assistive technology, and holds still for people who prefer
 * reduced motion. The parent sets --tilt-x and --tilt-y (-0.5 to 0.5) to follow the pointer.
 */
export function AuthScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.stage}>
        <div className={styles.plate} />

        <div className={`${styles.layer} ${styles.incoming}`}>
          <span className={styles.avatar}>
            <User size={16} />
            <span className={styles.online} />
          </span>
          <span className={styles.lines}>
            <span className={styles.bar} />
            <span className={`${styles.bar} ${styles.short}`} />
          </span>
        </div>

        <div className={`${styles.layer} ${styles.outgoing}`}>
          <span className={styles.lines}>
            <span className={styles.bar} />
            <span className={`${styles.bar} ${styles.medium}`} />
          </span>
          <CheckCheck size={16} className={styles.ticks} />
        </div>

        <div className={`${styles.layer} ${styles.attachment}`}>
          <span className={styles.chipIcon}>
            <Paperclip size={16} />
          </span>
          <span className={styles.lines}>
            <span className={styles.bar} />
            <span className={`${styles.bar} ${styles.short}`} />
          </span>
        </div>

        <div className={`${styles.layer} ${styles.typing}`}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>
      </div>
    </div>
  );
}
