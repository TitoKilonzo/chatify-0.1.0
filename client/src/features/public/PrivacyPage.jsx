import { Link } from 'react-router-dom';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { PageHeader } from './PageHeader.jsx';
import { CONTACT } from './site.js';
import styles from './Pages.module.css';

export function PrivacyPage() {
  usePageTitle('Privacy policy');
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Privacy policy"
        lead="What Chatify stores, why, and the choices you have. We have written it in plain language."
      />
      <div className={styles.container}>
        <div className={styles.prose}>
          <p className={styles.updated}>Last updated: November 2026</p>

          <h2>Information we store</h2>
          <ul>
            <li>
              <strong>Account details:</strong> your display name, username, email address and a
              salted hash of your password. We never store your password in plain text.
            </li>
            <li>
              <strong>Profile picture:</strong> if you upload one.
            </li>
            <li>
              <strong>Conversations:</strong> the messages you send, the files you attach, who is in
              each conversation, and delivery and read status.
            </li>
            <li>
              <strong>Sessions:</strong> a record of each signed-in session, including the browser
              identifier it used, so sessions can be managed and revoked.
            </li>
          </ul>
          <p>
            Your online status and typing activity are shared with the people you chat with while
            you are connected. They are held in memory and not kept as a history.
          </p>

          <h2>Cookies</h2>
          <p>
            Chatify uses a small number of cookies that are strictly necessary: sign-in cookies that
            scripts on the page cannot read, and a cookie that protects against forged requests. We
            do not use advertising cookies, analytics cookies or third-party tracking scripts.
          </p>

          <h2>How we use information</h2>
          <ul>
            <li>To deliver your messages and files to the people you send them to.</li>
            <li>To keep your account and the service secure, including limiting abuse.</li>
            <li>To respond when you contact us.</li>
          </ul>
          <p>We do not sell your information and we do not use it for advertising.</p>

          <h2>Who can see your messages</h2>
          <p>
            Only the members of a conversation can read it in the app. Messages are protected in
            transit and are stored on the server so they are available on all your devices. Chatify
            is not end-to-end encrypted, which means the people who operate the service can
            technically access stored data. They should do so only to run, secure and support the
            service, or where the law requires it.
          </p>

          <h2>Files</h2>
          <p>
            Files you share are stored on the server and can be downloaded only by signed-in members
            of that conversation. A file that was uploaded but never sent in a message is removed
            automatically after about a day.
          </p>

          <h2>Your choices</h2>
          <ul>
            <li>Edit or delete messages you have sent.</li>
            <li>
              Update your name, username, email and picture, or change your password, in Settings.
            </li>
            <li>
              Ask us to delete your account or give you a copy of your information by emailing{' '}
              <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
            </li>
          </ul>

          <h2>Children</h2>
          <p>
            Chatify is intended for people who are old enough to agree to these terms where they
            live. If you believe a child has created an account without permission, contact us and
            we will act on it.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            If we change how we handle information, we will update this page and the date above.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about privacy? Email <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>{' '}
            or see the <Link to="/contact">contact page</Link> for other ways to reach us.
          </p>
        </div>
      </div>
    </>
  );
}
