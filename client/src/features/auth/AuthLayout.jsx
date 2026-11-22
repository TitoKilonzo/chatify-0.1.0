import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import styles from './AuthLayout.module.css';

/** Centered card used by the sign-in and registration pages. */
export function AuthLayout({ title, description, footerText, footerLink, children }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <MessageSquare size={24} aria-hidden="true" />
          <span>Chatify</span>
        </div>
        <div className={styles.heading}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </div>
        {children}
        <p className={styles.footer}>
          {footerText}{' '}
          <Link to={footerLink.to} className={styles.link}>
            {footerLink.label}
          </Link>
        </p>
      </div>
    </main>
  );
}
