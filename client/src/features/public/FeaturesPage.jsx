import { ButtonLink } from '../../components/ui/ButtonLink.jsx';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { PageHeader } from './PageHeader.jsx';
import styles from './Pages.module.css';

const FEATURES = [
  {
    id: 'direct',
    title: 'Direct messages',
    intro: 'Private one-to-one conversations that are quick to start and easy to follow.',
    points: [
      'Search for people by name or username to start a chat.',
      'See unread counts and the latest message for every conversation at a glance.',
      'Search your conversations with Ctrl+K (Cmd+K on a Mac).',
      'Edit or delete your own messages after sending them.',
      'Mute a conversation to silence its unread count.',
    ],
  },
  {
    id: 'groups',
    title: 'Group chats',
    intro: 'Bring a team, class or family into one conversation, with clear roles.',
    points: [
      'Create a named group and invite members when you create it, or add more people later.',
      'Owners, admins and members have different permissions, so groups stay manageable.',
      'Give a group its own picture.',
      'When an owner leaves, ownership passes on so the group is never left without one.',
      'See who has read each message in a group.',
    ],
  },
  {
    id: 'files',
    title: 'File sharing',
    intro: 'Share what you are talking about without leaving the conversation.',
    points: [
      'Send images, PDFs, Word, Excel and PowerPoint files, zip archives, audio, video and plain text files.',
      'Uploads of up to 25 MB by default, with a progress bar while they send.',
      'Images preview inline and open in a larger viewer.',
      'Files are checked by their content, so a renamed file cannot slip through as something else.',
      'Downloads require you to be signed in and a member of the conversation.',
    ],
  },
  {
    id: 'realtime',
    title: 'Real-time, reliably',
    intro: 'Chatify tells you what is happening as it happens.',
    points: [
      'Sent, delivered and read receipts on every message you send.',
      'Typing indicators and online status.',
      'If you lose your connection, Chatify reconnects and fetches what you missed, with no duplicates.',
      'Unread counts also show in the browser tab title.',
    ],
  },
  {
    id: 'security',
    title: 'Security and privacy',
    intro: 'Protection is built into sign-in, sessions and uploads.',
    points: [
      'Passwords are stored as salted argon2id hashes.',
      'Sessions use secure, script-inaccessible cookies with rotating refresh tokens, and CSRF protection on every change.',
      'Repeated failed sign-ins temporarily lock the account, and sensitive endpoints are rate limited.',
      'Change your password at any time, which signs out every other session.',
      'Chatify does not use advertising or third-party tracking scripts.',
      'Messages are protected in transit but are not end-to-end encrypted. See the privacy policy for details.',
    ],
  },
  {
    id: 'app',
    title: 'Works the way you do',
    intro: 'Use Chatify on any modern device, in the browser or as an installed app.',
    points: [
      'Install it on your phone, tablet or computer for a native-app feel.',
      'A layout that adapts from phones to wide desktop screens.',
      'Full keyboard navigation and screen reader support, with live announcements for new messages.',
      'Keyboard shortcuts for searching, switching conversations and sending.',
    ],
  },
];

export function FeaturesPage() {
  usePageTitle('Features');
  return (
    <>
      <PageHeader
        eyebrow="Features"
        title="Everything you need for real-time conversation"
        lead="Direct messages, groups and file sharing, with the live feedback that makes a conversation feel natural."
      />
      <div className={styles.container}>
        {FEATURES.map((feature) => (
          <section
            key={feature.id}
            id={feature.id}
            tabIndex={-1}
            className={styles.feature}
            aria-labelledby={`${feature.id}-title`}
          >
            <div className={styles.featureIntro}>
              <h2 id={`${feature.id}-title`} className={styles.heading}>
                {feature.title}
              </h2>
              <p className={styles.muted}>{feature.intro}</p>
            </div>
            <ul className={styles.bullets}>
              {feature.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className={styles.section} aria-labelledby="features-cta">
          <div className={styles.sectionHeader}>
            <h2 id="features-cta" className={styles.heading}>
              Try it yourself
            </h2>
          </div>
          <div className={styles.actions}>
            <ButtonLink to="/register" variant="primary">
              Create an account
            </ButtonLink>
            <ButtonLink to="/help" variant="ghost">
              Visit the help center
            </ButtonLink>
          </div>
        </section>
      </div>
    </>
  );
}
