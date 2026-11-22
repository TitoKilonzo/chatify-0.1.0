import { useState } from 'react';
import { Users } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { getInitials } from '../../lib/format.js';
import styles from './Avatar.module.css';

const ICON_SIZES = { sm: 16, md: 20, lg: 28 };

/**
 * User or group avatar. Falls back to initials (users) or a group icon (groups) when there is no
 * image or the image fails to load. status="online" shows the Cherry presence dot.
 * Pass decorative when the name is already rendered as text next to the avatar.
 */
export function Avatar({
  name,
  src,
  size = 'md',
  kind = 'user',
  status,
  decorative = false,
  className,
}) {
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const label = [name, status === 'online' ? 'online' : null].filter(Boolean).join(', ');

  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };

  return (
    <span className={cx(styles.avatar, styles[size], className)} {...a11y}>
      {showImage ? (
        <img src={src} alt="" className={styles.image} onError={() => setFailedSrc(src)} />
      ) : kind === 'group' ? (
        <Users size={ICON_SIZES[size]} aria-hidden="true" />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
      {status === 'online' ? <span className={styles.dot} /> : null}
    </span>
  );
}
