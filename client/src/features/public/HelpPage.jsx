import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InstallButton, installInstructions } from '../../components/InstallButton.jsx';
import { ButtonLink } from '../../components/ui/ButtonLink.jsx';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { SHORTCUTS } from '../chat/useShortcuts.js';
import { PageHeader } from './PageHeader.jsx';
import { CONTACT } from './site.js';
import styles from './Pages.module.css';

const START_STEPS = [
  {
    title: 'Create an account',
    text: 'Choose Get started, then enter your name, a username, your email and a password of at least 10 characters.',
  },
  {
    title: 'Find someone to talk to',
    text: 'Open Chats, choose the new chat button and search by name or username. To make a group, choose the new group button instead.',
  },
  {
    title: 'Send your first message',
    text: 'Type in the box at the bottom and press Enter. Use the paperclip to attach a file.',
  },
];

const INSTALL_TARGETS = [
  { title: 'iPhone and iPad', platform: { family: 'ios', safari: true } },
  { title: 'Android', platform: { family: 'android', safari: false } },
  { title: 'Chrome or Edge on a computer', platform: { family: 'desktop', safari: false } },
  { title: 'Safari on a Mac', platform: { family: 'safari', safari: true } },
];

const FAQ = [
  {
    q: 'What do I need to create an account?',
    a: 'An email address, a unique username of 3 to 30 letters, numbers or underscores, and a password of at least 10 characters.',
  },
  {
    q: 'I forgot my password. What can I do?',
    a: (
      <>
        Password reset by email is not available yet. Contact us at{' '}
        <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> and we will help you regain access.
        If you can still sign in, you can change your password under Settings.
      </>
    ),
  },
  {
    q: 'What do the tick marks on my messages mean?',
    a: 'One tick means the message was sent. Two ticks mean it was delivered to the other person. Two bold ticks mean it was read. In a group, hover over the ticks to see how many people have read it.',
  },
  {
    q: 'Which files can I send, and how large can they be?',
    a: 'You can send images (PNG, JPEG, GIF, WebP), PDFs, Word, Excel and PowerPoint files, zip archives, MP3 audio, MP4 video and plain text, CSV, Markdown or JSON files. The default limit is 25 MB per file. Files are checked by their content, so a file renamed to look like another type is rejected.',
  },
  {
    q: 'How do group roles work?',
    a: 'The person who creates a group is its owner. Owners and admins can add members and remove regular members, and only owners can make or remove admins. Any member can leave. If the owner leaves, ownership passes to another member.',
  },
  {
    q: 'Can I edit or delete a message?',
    a: "Yes. You can edit or delete messages you sent from the message menu. You cannot change other people's messages.",
  },
  {
    q: 'Will I get notifications when Chatify is closed?',
    a: 'Not yet. Chatify shows unread badges in the app and the unread count in the browser tab title while it is open.',
  },
  {
    q: 'Are my messages end-to-end encrypted?',
    a: (
      <>
        No. Messages are protected in transit and stored on the server, which is how features like
        message history across devices work. See the <Link to="/privacy">privacy policy</Link> for
        what is stored and how it is handled.
      </>
    ),
  },
  {
    q: 'Why does Chatify say I am offline?',
    a: 'Chatify needs an internet connection to send and receive messages. It reconnects automatically when your connection returns and fetches anything you missed.',
  },
];

export function HelpPage() {
  usePageTitle('Help');
  return (
    <>
      <PageHeader
        eyebrow="Help center"
        title="How can we help?"
        lead="Get started, install the app, learn the shortcuts and find answers to common questions."
      />
      <div className={styles.container}>
        <section id="start" tabIndex={-1} className={`${styles.section} ${styles.anchor}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.heading}>Get started</h2>
          </div>
          <ol className={styles.steps}>
            {START_STEPS.map((step) => (
              <li key={step.title}>
                <h3 className={styles.subheading}>{step.title}</h3>
                <p className={styles.muted}>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="install" tabIndex={-1} className={`${styles.section} ${styles.anchor}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.heading}>Install the app</h2>
            <p className={styles.muted}>
              Installing adds Chatify to your home screen or desktop so it opens in its own window.
              If your browser supports it, the button below installs it directly.
            </p>
            <div className={styles.actions}>
              <InstallButton variant="primary" />
            </div>
          </div>
          <div className={styles.accordion}>
            {INSTALL_TARGETS.map(({ title, platform }) => (
              <details key={title}>
                <summary>
                  <span>{title}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <div className={styles.answer}>
                  <ol className={styles.bullets}>
                    {installInstructions(platform).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section id="shortcuts" tabIndex={-1} className={`${styles.section} ${styles.anchor}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.heading}>Keyboard shortcuts</h2>
            <p className={styles.muted}>Available once you are signed in.</p>
          </div>
          <dl className={styles.shortcuts}>
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className={styles.shortcutRow}>
                <dt>
                  <kbd>{shortcut.keys}</kbd>
                </dt>
                <dd>{shortcut.action}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="faq" tabIndex={-1} className={`${styles.section} ${styles.anchor}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.heading}>Questions and answers</h2>
          </div>
          <div className={styles.accordion}>
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>
                  <span>{item.q}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <div className={styles.answer}>
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="help-contact">
          <div className={styles.sectionHeader}>
            <h2 id="help-contact" className={styles.heading}>
              Still need help?
            </h2>
            <p className={styles.muted}>Our team is happy to help by email, phone or WhatsApp.</p>
          </div>
          <div className={styles.actions}>
            <ButtonLink to="/contact" variant="primary">
              Contact us
            </ButtonLink>
          </div>
        </section>
      </div>
    </>
  );
}
