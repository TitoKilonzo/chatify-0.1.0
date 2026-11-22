import { Link } from 'react-router-dom';
import { Mail, MessageCircle, MessageSquare, Phone } from 'lucide-react';
import { InstallButton } from '../../components/InstallButton.jsx';
import { CONTACT, LEGAL_LINKS, MAILTO_URL, SITE_NAV, TEL_URL, WHATSAPP_URL } from './site.js';
import styles from './PublicLayout.module.css';

export function SiteFooter() {
  const menus = SITE_NAV.filter((entry) => entry.type === 'menu');
  const links = SITE_NAV.filter((entry) => entry.type === 'link');

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <Link to="/" className={styles.footerLogo}>
            <MessageSquare size={24} aria-hidden="true" />
            <span>Chatify</span>
          </Link>
          <p className={styles.footerTagline}>
            Fast, private messaging for direct and group conversations.
          </p>
          <InstallButton variant="secondary" size="sm" className={styles.footerInstall} />
        </div>

        <nav className={styles.footerColumns} aria-label="Footer">
          <div className={styles.footerColumn}>
            <p className={styles.footerHeading}>Company</p>
            <ul>
              {links.map((entry) => (
                <li key={entry.to}>
                  <Link to={entry.to}>{entry.label}</Link>
                </li>
              ))}
              {LEGAL_LINKS.map((entry) => (
                <li key={entry.to}>
                  <Link to={entry.to}>{entry.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          {menus.map((entry) => (
            <div key={entry.label} className={styles.footerColumn}>
              <p className={styles.footerHeading}>{entry.label}</p>
              <ul>
                {entry.items.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className={styles.footerColumn}>
            <p className={styles.footerHeading}>Contact</p>
            <ul>
              <li>
                <a href={MAILTO_URL}>
                  <Mail size={16} aria-hidden="true" />
                  <span>{CONTACT.email}</span>
                </a>
              </li>
              <li>
                <a href={TEL_URL}>
                  <Phone size={16} aria-hidden="true" />
                  <span>{CONTACT.phoneDisplay}</span>
                </a>
              </li>
              <li>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={16} aria-hidden="true" />
                  <span>WhatsApp</span>
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <p className={styles.copyright}>Chatify. All rights reserved.</p>
    </footer>
  );
}
