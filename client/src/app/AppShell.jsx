import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { LogOut, MessageSquare, Phone, Settings, Users } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Menu } from '../components/ui/Menu.jsx';
import { cx } from '../lib/cx.js';
import { useLogout, useSession } from '../features/auth/useSession.js';
import { Announcer, ConnectionBanner } from '../features/chat/LiveRegions.jsx';
import { useConversationsQuery } from '../features/chat/useConversations.js';
import { CallOverlay } from '../features/chat/CallOverlay.jsx';
import { useRealtime } from '../features/chat/useRealtime.js';
import styles from './AppShell.module.css';

// Navigation grows as features land; every entry here must lead to a real route.
const NAV_ITEMS = [
  { to: '/chats', label: 'Chats', icon: MessageSquare },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/calls', label: 'Calls', icon: Phone },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Signed-in layout: navigation rail on the left, routed content on the right. */
export function AppShell() {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const conversations = useConversationsQuery();
  useRealtime(user.id);

  // Reflect unread messages in the tab title so they are visible from other tabs.
  const unreadTotal = (conversations.data ?? []).reduce(
    (sum, conversation) => sum + (conversation.muted ? 0 : conversation.unreadCount),
    0,
  );
  useEffect(() => {
    document.title = unreadTotal > 0 ? `(${unreadTotal}) Chatify` : 'Chatify';
  }, [unreadTotal]);

  const menuItems = [
    { id: 'settings', label: 'Settings', icon: Settings, onSelect: () => navigate('/settings') },
    { id: 'logout', label: 'Log out', icon: LogOut, onSelect: () => logout.mutate() },
  ];

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="Primary">
        <div className={styles.brand}>
          <MessageSquare size={24} aria-hidden="true" />
          <span className={styles.label}>Chatify</span>
        </div>

        <ul className={styles.nav}>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) => cx(styles.navLink, isActive && styles.active)}
              >
                <Icon size={20} aria-hidden="true" />
                <span className={styles.label}>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className={styles.account}>
          <Menu
            label="Account"
            items={menuItems}
            placement="top-start"
            trigger={(triggerProps) => (
              <button type="button" className={styles.accountButton} {...triggerProps}>
                <Avatar name={user.displayName} src={user.avatarUrl} size="sm" decorative />
                <span className={cx(styles.accountText, styles.label)}>
                  <span className={styles.accountName}>{user.displayName}</span>
                  <span className={styles.accountHandle}>@{user.username}</span>
                </span>
              </button>
            )}
          />
        </div>
      </nav>

      <main className={styles.content}>
        <Announcer />
        <ConnectionBanner />
        <ErrorBoundary resetKey={location.pathname.split('/')[1]}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <CallOverlay />
    </div>
  );
}
