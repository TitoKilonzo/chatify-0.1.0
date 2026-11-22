import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { Button } from './ui/Button.jsx';
import styles from './FullPageStatus.module.css';

export function FullPageLoader() {
  return (
    <div className={styles.page} role="status">
      <LoaderCircle className={styles.spinner} size={32} aria-hidden="true" />
      <p className={styles.text}>Loading</p>
    </div>
  );
}

export function FullPageError({ message, onRetry }) {
  return (
    <div className={styles.page} role="alert">
      <TriangleAlert size={32} aria-hidden="true" />
      <p className={styles.title}>Could not load Chatify</p>
      <p className={styles.text}>{message}</p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
