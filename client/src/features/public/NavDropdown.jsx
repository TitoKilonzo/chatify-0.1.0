import { ChevronDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu } from '../../components/ui/Menu.jsx';
import { cx } from '../../lib/cx.js';
import { isActivePath } from './site.js';
import styles from './PublicLayout.module.css';

/** Header dropdown built on the shared accessible Menu. Selecting an item navigates to it. */
export function NavDropdown({ label, items }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = items.some((item) => isActivePath(item.to, pathname));

  return (
    <Menu
      label={label}
      items={items.map((item) => ({
        id: item.to,
        label: item.label,
        onSelect: () => navigate(item.to),
      }))}
      trigger={(triggerProps) => (
        <button
          type="button"
          className={cx(styles.navItem, active && styles.navActive)}
          {...triggerProps}
        >
          <span>{label}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
    />
  );
}
