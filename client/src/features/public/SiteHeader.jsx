import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu as MenuIcon, MessageSquare, X } from 'lucide-react';
import { InstallButton } from '../../components/InstallButton.jsx';
import { ButtonLink } from '../../components/ui/ButtonLink.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { cx } from '../../lib/cx.js';
import { useSession } from '../auth/useSession.js';
import { NavDropdown } from './NavDropdown.jsx';
import { SITE_NAV } from './site.js';
import styles from './PublicLayout.module.css';

/** Sign in / Get started for visitors, a single shortcut into the app for signed-in users. */
function AccountActions({ size = 'md' }) {
  const { data: user, isPending } = useSession();
  if (isPending) {
    return null;
  }
  if (user) {
    return (
      <ButtonLink to="/chats" variant="primary" size={size}>
        Open Chatify
      </ButtonLink>
    );
  }
  return (
    <>
      <ButtonLink to="/login" variant="ghost" size={size}>
        Sign in
      </ButtonLink>
      <ButtonLink to="/register" variant="primary" size={size}>
        Get started
      </ButtonLink>
    </>
  );
}

export function SiteHeader() {
  // The panel is open only for the location it was opened on, so any navigation (including a
  // hash jump on the same page) closes it without an effect.
  const [openKey, setOpenKey] = useState(null);
  const { key } = useLocation();
  const open = openKey === key;

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link to="/" className={styles.brand} aria-label="Chatify home">
          <MessageSquare size={24} aria-hidden="true" />
          <span>Chatify</span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Main">
          {SITE_NAV.map((entry) =>
            entry.type === 'menu' ? (
              <NavDropdown key={entry.label} label={entry.label} items={entry.items} />
            ) : (
              <NavLink
                key={entry.to}
                to={entry.to}
                end
                className={({ isActive }) => cx(styles.navItem, isActive && styles.navActive)}
              >
                {entry.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className={styles.desktopActions}>
          <InstallButton size="sm" />
          <AccountActions size="sm" />
        </div>

        <IconButton
          className={styles.menuToggle}
          label={open ? 'Close menu' : 'Open menu'}
          icon={open ? X : MenuIcon}
          aria-expanded={open}
          aria-controls="mobile-panel"
          onClick={() => setOpenKey(open ? null : key)}
        />
      </div>

      {open ? (
        <nav id="mobile-panel" className={styles.mobilePanel} aria-label="Main">
          {SITE_NAV.map((entry) =>
            entry.type === 'menu' ? (
              <div key={entry.label} className={styles.mobileGroup}>
                <p className={styles.mobileHeading}>{entry.label}</p>
                {entry.items.map((item) => (
                  <Link key={item.to} to={item.to} className={styles.mobileLink}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link key={entry.to} to={entry.to} className={styles.mobileLink}>
                {entry.label}
              </Link>
            ),
          )}
          <div className={styles.mobileActions}>
            <AccountActions />
            <InstallButton onActivate={() => setOpenKey(null)} />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
