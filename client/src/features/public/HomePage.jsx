import {
  CheckCheck,
  Download,
  Lock,
  MessageSquare,
  Paperclip,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { InstallButton } from '../../components/InstallButton.jsx';
import { ButtonLink } from '../../components/ui/ButtonLink.jsx';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useSession } from '../auth/useSession.js';
import styles from './Pages.module.css';

const HIGHLIGHTS = [
  {
    icon: Zap,
    title: 'Instant delivery',
    text: 'Messages arrive the moment they are sent. If your connection drops, Chatify catches up when it returns, without gaps or duplicates.',
  },
  {
    icon: MessageSquare,
    title: 'Direct messages',
    text: 'Find anyone by name or username and start talking. Unread counts and previews keep your list easy to scan.',
  },
  {
    icon: Users,
    title: 'Group chats',
    text: 'Bring people together with named groups, owners and admins, and a group picture. Add or remove members at any time.',
  },
  {
    icon: Paperclip,
    title: 'File sharing',
    text: 'Send images, PDFs, documents, audio and video. Images preview in the conversation and every upload is checked.',
  },
  {
    icon: CheckCheck,
    title: 'Receipts and typing',
    text: 'See when a message is sent, delivered and read, and when someone is typing, so nobody is left guessing.',
  },
  {
    icon: Download,
    title: 'Installable app',
    text: 'Add Chatify to your phone or computer and open it like a native app, in its own window.',
  },
];

const STEPS = [
  {
    title: 'Create your account',
    text: 'Sign up with an email address, a username and a password. It takes under a minute.',
  },
  {
    title: 'Start a conversation',
    text: 'Search for a person to chat one to one, or create a group and invite the people you need.',
  },
  {
    title: 'Share and stay in sync',
    text: 'Send messages and files from any device. Everything stays in step across your tabs and devices.',
  },
];

const PRIVACY_POINTS = [
  'Passwords are stored as salted argon2id hashes, never in plain text.',
  'Sign-in sessions use secure cookies that scripts on the page cannot read.',
  'Every upload is verified by its content, not just its file name.',
  'No advertising and no third-party tracking scripts.',
];

export function HomePage() {
  usePageTitle('');
  const { data: user } = useSession();

  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.container}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Real-time messaging</p>
              <h1 id="hero-title" className={styles.display}>
                Conversations that keep up with you.
              </h1>
              <p className={styles.lead}>
                Chatify is a fast, private messenger for direct and group conversations, with file
                sharing, read receipts and typing indicators that update the moment something
                happens.
              </p>
              <div className={styles.actions}>
                {user ? (
                  <ButtonLink to="/chats" variant="primary">
                    Open Chatify
                  </ButtonLink>
                ) : (
                  <>
                    <ButtonLink to="/register" variant="primary">
                      Create an account
                    </ButtonLink>
                    <ButtonLink to="/login" variant="ghost">
                      Sign in
                    </ButtonLink>
                  </>
                )}
                <InstallButton />
              </div>
            </div>

            <div className={styles.heroPanel}>
              <h2>Built for everyday conversation</h2>
              <ul className={styles.heroList}>
                <li>
                  <Zap size={20} aria-hidden="true" />
                  <div>
                    <strong>Live by default</strong>
                    <span>Delivery, read and typing updates in real time.</span>
                  </div>
                </li>
                <li>
                  <Users size={20} aria-hidden="true" />
                  <div>
                    <strong>One to one or the whole team</strong>
                    <span>Direct messages and groups in the same place.</span>
                  </div>
                </li>
                <li>
                  <Lock size={20} aria-hidden="true" />
                  <div>
                    <strong>Private by design</strong>
                    <span>Secure sign-in and checked uploads.</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="features-title">
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 id="features-title" className={styles.heading}>
              Everything you need to talk
            </h2>
            <p className={styles.muted}>
              Chatify focuses on the essentials and does them well.{' '}
              <Link to="/features" className={styles.link}>
                See every feature
              </Link>
              .
            </p>
          </div>
          <div className={styles.grid}>
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <article key={title} className={styles.card}>
                <span className={styles.cardIcon}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className={styles.subheading}>{title}</h3>
                <p className={styles.muted}>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="how-title">
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 id="how-title" className={styles.heading}>
              How it works
            </h2>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((step) => (
              <li key={step.title}>
                <h3 className={styles.subheading}>{step.title}</h3>
                <p className={styles.muted}>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.band}`} aria-labelledby="privacy-title">
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 id="privacy-title" className={styles.heading}>
              Your conversations stay yours
            </h2>
            <p className={styles.bandText}>
              Security is part of how Chatify is built, not an add-on.
            </p>
          </div>
          <ul className={styles.checks}>
            {PRIVACY_POINTS.map((point) => (
              <li key={point}>
                <ShieldCheck size={20} aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className={styles.bandText}>
            <Link to="/privacy">Read the privacy policy</Link>
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="cta-title">
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 id="cta-title" className={styles.heading}>
              Ready to start talking?
            </h2>
            <p className={styles.muted}>
              Create an account, or get in touch if you have questions first.
            </p>
          </div>
          <div className={styles.actions}>
            {user ? (
              <ButtonLink to="/chats" variant="primary">
                Open Chatify
              </ButtonLink>
            ) : (
              <ButtonLink to="/register" variant="primary">
                Get started
              </ButtonLink>
            )}
            <ButtonLink to="/contact" variant="ghost">
              Contact us
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
