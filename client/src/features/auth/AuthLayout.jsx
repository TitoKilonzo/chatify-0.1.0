import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Home, MessageSquare, ShieldCheck, Users, Zap } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { AuthScene } from './AuthScene.jsx';
import styles from './AuthLayout.module.css';

const POINTS = [
  { icon: Zap, text: 'Messages, receipts and typing update live' },
  { icon: Users, text: 'Chat one to one or with the whole group' },
  { icon: ShieldCheck, text: 'Secure sign-in and checked file uploads' },
];

/** Split layout for sign-in and registration: a 3D showcase beside a focused form card. */
export function AuthLayout({ title, description, footerText, footerLink, children }) {
  usePageTitle(title);
  const showcaseRef = useRef(null);

  // The scene leans slightly toward the pointer. Skipped when the user prefers reduced motion.
  function handlePointerMove(event) {
    const element = showcaseRef.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const rect = element.getBoundingClientRect();
    element.style.setProperty(
      '--tilt-x',
      ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3),
    );
    element.style.setProperty(
      '--tilt-y',
      ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3),
    );
  }

  function handlePointerLeave() {
    showcaseRef.current?.style.removeProperty('--tilt-x');
    showcaseRef.current?.style.removeProperty('--tilt-y');
  }

  return (
    <main className={styles.page}>
      {/* Decorative panel: pointer tracking only, no interactive content. */}
      <aside
        ref={showcaseRef}
        className={styles.showcase}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <Link to="/" className={styles.showcaseBrand} aria-label="Chatify home">
          <MessageSquare size={24} aria-hidden="true" />
          <span>Chatify</span>
        </Link>
        <AuthScene />
        <div className={styles.showcaseCopy}>
          <h2 className={styles.showcaseTitle}>Your conversations, in real time</h2>
          <ul className={styles.points}>
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={20} aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className={styles.formSide}>
        <div className={styles.column}>
          <Link to="/" className={styles.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            <Home size={16} aria-hidden="true" />
            <span>Back to home</span>
          </Link>
          <div className={styles.card}>
            <Link to="/" className={styles.cardBrand} aria-label="Chatify home">
              <MessageSquare size={24} aria-hidden="true" />
              <span>Chatify</span>
            </Link>
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
        </div>
      </section>
    </main>
  );
}
