import { Link } from 'react-router-dom';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { PageHeader } from './PageHeader.jsx';
import { CONTACT } from './site.js';
import styles from './Pages.module.css';

export function TermsPage() {
  usePageTitle('Terms of use');
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Terms of use"
        lead="The ground rules for using Chatify. By creating an account or using the service you agree to them."
      />
      <div className={styles.container}>
        <div className={styles.prose}>
          <p className={styles.updated}>Last updated: November 2026</p>

          <h2>Your account</h2>
          <ul>
            <li>Give accurate information when you register and keep it up to date.</li>
            <li>
              Keep your password private. You are responsible for activity under your account, so
              tell us promptly if you think it has been used without your permission.
            </li>
            <li>One person per account. Do not impersonate anyone.</li>
          </ul>

          <h2>Acceptable use</h2>
          <p>You agree not to use Chatify to:</p>
          <ul>
            <li>harass, threaten or abuse other people;</li>
            <li>share content that is illegal or that infringes someone else&apos;s rights;</li>
            <li>send spam or unsolicited bulk messages;</li>
            <li>
              upload malware or try to disrupt, probe or gain unauthorized access to the service;
            </li>
            <li>collect other people&apos;s information without their consent.</li>
          </ul>

          <h2>Your content</h2>
          <p>
            You keep ownership of the messages and files you send. You allow Chatify to store and
            deliver them to the people you choose to send them to, which is needed to run the
            service. You are responsible for what you send and for having the right to share it.
          </p>

          <h2>The service</h2>
          <p>
            We work to keep Chatify available and reliable, but we cannot guarantee uninterrupted
            service. Features may change over time. The service is provided as it is, to the extent
            the law allows.
          </p>

          <h2>Ending your use</h2>
          <p>
            You can stop using Chatify at any time and ask us to delete your account. We may suspend
            or close accounts that break these terms or put other people or the service at risk.
          </p>

          <h2>Changes to these terms</h2>
          <p>
            We may update these terms. When we do, we will change the date above. If you keep using
            Chatify after an update, you accept the new terms.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these terms? Email{' '}
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> or visit the{' '}
            <Link to="/contact">contact page</Link>. Our <Link to="/privacy">privacy policy</Link>{' '}
            explains how we handle your information.
          </p>
        </div>
      </div>
    </>
  );
}
