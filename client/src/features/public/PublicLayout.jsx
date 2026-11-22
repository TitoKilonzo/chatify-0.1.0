import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { FullPageLoader } from '../../components/FullPageStatus.jsx';
import { SiteFooter } from './SiteFooter.jsx';
import { SiteHeader } from './SiteHeader.jsx';
import styles from './PublicLayout.module.css';

/** Scroll to the hash target when there is one, otherwise to the top of the new page. */
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        target.focus({ preventScroll: true });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
}

/** Shared frame for every page a visitor can see before signing in. */
export function PublicLayout() {
  useScrollOnNavigate();
  return (
    <div className={styles.frame}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className={styles.main} tabIndex={-1}>
        <Suspense fallback={<FullPageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
