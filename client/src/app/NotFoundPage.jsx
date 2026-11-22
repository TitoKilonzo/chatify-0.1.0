import { MessageSquare } from 'lucide-react';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <main className={styles.page}>
      <MessageSquare size={32} aria-hidden="true" />
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.message}>The page you requested does not exist.</p>
    </main>
  );
}
