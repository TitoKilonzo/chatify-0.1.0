import { Home, MessageSquare } from 'lucide-react';
import { ButtonLink } from '../components/ui/ButtonLink.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <div className={styles.page}>
      <MessageSquare size={32} aria-hidden="true" />
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.message}>The page you requested does not exist.</p>
      <ButtonLink to="/" variant="secondary" leadingIcon={Home}>
        Back to home
      </ButtonLink>
    </div>
  );
}
