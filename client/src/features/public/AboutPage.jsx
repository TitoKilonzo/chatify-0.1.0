import { Accessibility, Gauge, Lock, Sparkles } from 'lucide-react';
import { ButtonLink } from '../../components/ui/ButtonLink.jsx';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { PageHeader } from './PageHeader.jsx';
import styles from './Pages.module.css';

const PRINCIPLES = [
  {
    icon: Gauge,
    title: 'Fast and dependable',
    text: 'A message should arrive when it is sent. Chatify delivers in real time and recovers cleanly when the network does not cooperate.',
  },
  {
    icon: Lock,
    title: 'Private by design',
    text: 'Careful handling of passwords, sessions and files comes first, and Chatify has no advertising or third-party tracking.',
  },
  {
    icon: Accessibility,
    title: 'Open to everyone',
    text: 'Keyboard navigation, readable contrast and screen reader announcements are part of the product, not an afterthought.',
  },
  {
    icon: Sparkles,
    title: 'Simple on purpose',
    text: 'Chats, groups and files, presented clearly. We add features when they make conversation better, not to fill a list.',
  },
];

export function AboutPage() {
  usePageTitle('About');
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="A messenger that stays out of the way"
        lead="Chatify exists to make staying in touch quick, clear and private, whether you are talking to one person or a whole group."
      />
      <div className={styles.container}>
        <div className={styles.prose}>
          <h2>What Chatify is</h2>
          <p>
            Chatify is a web-based messenger for direct and group conversations. You can send text
            and files, see when messages are delivered and read, and watch conversations update live
            as people type and reply. It runs in any modern browser and can be installed on your
            phone or computer.
          </p>
          <h2>Why we built it</h2>
          <p>
            Many messaging tools are crowded with features that get in the way of the one thing
            people open them for: talking. Chatify keeps the interface calm and the essentials
            reliable, so the conversation is always the focus.
          </p>
        </div>

        <section className={styles.section} aria-labelledby="principles-title">
          <div className={styles.sectionHeader}>
            <h2 id="principles-title" className={styles.heading}>
              What we care about
            </h2>
          </div>
          <div className={styles.grid}>
            {PRINCIPLES.map(({ icon: Icon, title, text }) => (
              <article key={title} className={styles.card}>
                <span className={styles.cardIcon}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className={styles.subheading}>{title}</h3>
                <p className={styles.muted}>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="about-cta">
          <div className={styles.sectionHeader}>
            <h2 id="about-cta" className={styles.heading}>
              Questions or ideas?
            </h2>
            <p className={styles.muted}>We would like to hear from you.</p>
          </div>
          <div className={styles.actions}>
            <ButtonLink to="/contact" variant="primary">
              Contact us
            </ButtonLink>
            <ButtonLink to="/features" variant="ghost">
              Explore features
            </ButtonLink>
          </div>
        </section>
      </div>
    </>
  );
}
