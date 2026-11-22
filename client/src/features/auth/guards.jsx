import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageError, FullPageLoader } from '../../components/FullPageStatus.jsx';
import { useSession } from './useSession.js';

const DEFAULT_LANDING = '/chats';

/** Renders child routes only for signed-in users; everyone else is sent to the login page. */
export function RequireAuth() {
  const location = useLocation();
  const { data: user, isPending, isError, error, refetch } = useSession();

  if (isPending) {
    return <FullPageLoader />;
  }
  if (isError) {
    return <FullPageError message={error.message} onRetry={refetch} />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Renders child routes only for signed-out users; signed-in users go to the app. */
export function GuestOnly() {
  const location = useLocation();
  const { data: user, isPending, isError, error, refetch } = useSession();

  if (isPending) {
    return <FullPageLoader />;
  }
  if (isError) {
    return <FullPageError message={error.message} onRetry={refetch} />;
  }
  if (user) {
    const from = location.state?.from;
    // Only follow internal paths, never an arbitrary URL.
    const target = typeof from === 'string' && from.startsWith('/') ? from : DEFAULT_LANDING;
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
